import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "30"; // days
  const days = parseInt(range);
  const from = new Date();
  from.setDate(from.getDate() - days);

  // Revenue by day
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from }, paymentStatus: "PAID" },
    select: { createdAt: true, total: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const revenueByDay: Record<string, number> = {};
  const orderCountByDay: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    revenueByDay[key] = 0;
    orderCountByDay[key] = 0;
  }
  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    if (revenueByDay[key] !== undefined) {
      revenueByDay[key] += Number(order.total);
      orderCountByDay[key] += 1;
    }
  }

  const revenueChart = Object.entries(revenueByDay).map(([date, revenue]) => ({
    date,
    revenue: parseFloat(revenue.toFixed(2)),
    orders: orderCountByDay[date],
  }));

  // Top selling products
  const topProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true, total: true },
    where: { order: { createdAt: { gte: from }, paymentStatus: "PAID" } },
    orderBy: { _sum: { quantity: "desc" } },
    take: 10,
  });

  const productIds = topProducts.map((p) => p.productId);
  const productDetails = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true, name: true, price: true,
      category: { select: { name: true } },
      images: { where: { isPrimary: true }, take: 1 },
    },
  });

  const topProductsData = topProducts.map((tp) => {
    const detail = productDetails.find((p) => p.id === tp.productId);
    return {
      ...detail,
      totalSold: tp._sum.quantity,
      totalRevenue: parseFloat(Number(tp._sum.total || 0).toFixed(2)),
    };
  });

  // Revenue by category
  const categoryRevenue = await prisma.orderItem.groupBy({
    by: ["productId"],
    _sum: { total: true },
    where: { order: { createdAt: { gte: from }, paymentStatus: "PAID" } },
  });

  const allProducts = await prisma.product.findMany({
    where: { id: { in: categoryRevenue.map((c) => c.productId) } },
    select: { id: true, category: { select: { id: true, name: true } } },
  });

  const catMap: Record<string, { name: string; revenue: number }> = {};
  for (const cr of categoryRevenue) {
    const product = allProducts.find((p) => p.id === cr.productId);
    if (product) {
      const catId = product.category.id;
      if (!catMap[catId]) catMap[catId] = { name: product.category.name, revenue: 0 };
      catMap[catId].revenue += Number(cr._sum.total || 0);
    }
  }

  const categoryRevenueData = Object.values(catMap)
    .map((c) => ({ ...c, revenue: parseFloat(c.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Totals for period
  const periodStats = await prisma.order.aggregate({
    _sum: { total: true, discount: true },
    _count: { id: true },
    where: { createdAt: { gte: from }, paymentStatus: "PAID" },
  });

  const newCustomers = await prisma.user.count({
    where: { role: "USER", createdAt: { gte: from } },
  });

  return NextResponse.json({
    period: { days, from: from.toISOString() },
    summary: {
      totalRevenue: parseFloat(Number(periodStats._sum.total || 0).toFixed(2)),
      totalOrders: periodStats._count.id,
      totalDiscount: parseFloat(Number(periodStats._sum.discount || 0).toFixed(2)),
      newCustomers,
      avgOrderValue:
        periodStats._count.id > 0
          ? parseFloat((Number(periodStats._sum.total || 0) / periodStats._count.id).toFixed(2))
          : 0,
    },
    revenueChart,
    topProducts: topProductsData,
    categoryRevenue: categoryRevenueData,
  });
}
