import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) {
    return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalOrders,
    monthOrders,
    lastMonthOrders,
    totalCustomers,
    newCustomers,
    totalProducts,
    lowStockProducts,
    totalRevenue,
    monthRevenue,
    recentOrders,
    topProducts,
    ordersByStatus,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.user.count({ where: { role: "USER", createdAt: { gte: startOfMonth } } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, stock: { lte: 10 } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: "PAID" },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: "PAID", createdAt: { gte: startOfMonth } },
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const productIds = topProducts.map((p) => p.productId);
  const productDetails = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, price: true, images: { where: { isPrimary: true }, take: 1 } },
  });

  const topProductsWithDetails = topProducts.map((tp) => {
    const detail = productDetails.find((p) => p.id === tp.productId);
    return { ...detail, totalSold: tp._sum.quantity };
  });

  const revenueGrowth =
    Number(monthRevenue._sum.total || 0) > 0 && lastMonthOrders > 0
      ? (((Number(monthRevenue._sum.total || 0) - Number(lastMonthOrders)) / Number(lastMonthOrders)) * 100).toFixed(1)
      : "0";

  return NextResponse.json({
    stats: {
      totalOrders,
      monthOrders,
      orderGrowth: monthOrders - lastMonthOrders,
      totalCustomers,
      newCustomers,
      totalProducts,
      lowStockProducts,
      totalRevenue: Number(totalRevenue._sum.total || 0).toFixed(2),
      monthRevenue: Number(monthRevenue._sum.total || 0).toFixed(2),
      revenueGrowth,
    },
    recentOrders,
    topProducts: topProductsWithDetails,
    ordersByStatus,
  });
}
