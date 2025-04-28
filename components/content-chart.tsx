import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

// Sample data - replace with your actual data


// Format date for display
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

interface ContentChartProps {
  data?: Array<{ date: string; count: number }>
  title?: string
  description?: string
}

export default function ContentChart({
  data,
  title,
  description,
}: ContentChartProps) {
  return (
    <div className="w-full rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div className="h-[400px]" role="img" aria-label="Line chart showing content publication trends over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 25,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} angle={-45} textAnchor="end" />
            <YAxis tick={{ fontSize: 12 }} tickCount={5} domain={[0, "dataMax + 5"]} />
            <Tooltip
              formatter={(value) => [`${value} entries`, "Published Content"]}
              labelFormatter={formatDate}
              contentStyle={{
                borderRadius: "0.5rem",
                border: "none",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                padding: "0.75rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              name="Content Published"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
