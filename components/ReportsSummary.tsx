type Props = {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  topProductName: string
}

export default function ReportsSummary({
  totalRevenue,
  totalOrders,
  avgOrderValue,
  topProductName,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="flex flex-1 flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-black border border-slate-200 dark:border-gray-800">
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">Total Revenue</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-black border border-slate-200 dark:border-gray-800">
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">Total Orders</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">{totalOrders}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-black border border-slate-200 dark:border-gray-800">
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">Average Order Value</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">${avgOrderValue.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-4 rounded-xl p-6 bg-white dark:bg-black border border-slate-200 dark:border-gray-800">
        <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">Top Selling Item</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold truncate">{topProductName}</p>
        </div>
      </div>
    </div>
  )
}

