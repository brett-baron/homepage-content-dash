import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { useState, useEffect } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Sample data - replace with your actual data


// Format date for display
const formatDate = (dateString: string) => {
  // For dates in format YYYY-MM-DD, JavaScript interprets MM as 1-indexed
  // But creates a Date with 0-indexed month, causing off-by-one errors
  // We'll manually parse and adjust
  const [year, month] = dateString.split('-');
  
  // Create a date with the correct month (subtract 1 because JS months are 0-indexed)
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  
  // Debug to verify the correct month  
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface ContentChartProps {
  data?: Array<{ date: string; count: number }>
  updatedData?: Array<{ date: string; count: number }>
  title?: string
  description?: string
}

type TimeRange = 'all' | 'year' | '6months';
type ContentType = 'new' | 'updated';

export default function ContentChart({
  data = [],
  updatedData = [],
  title,
  description,
}: ContentChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('year');
  const [contentType, setContentType] = useState<ContentType>('new');
  const [filteredData, setFilteredData] = useState(data);

  useEffect(() => {
    // Check which data source to use based on content type
    const sourceData = contentType === 'new' ? data : updatedData;
    
    // Return early only if the selected sourceData is empty
    if (!sourceData || sourceData.length === 0) {
      console.log(`Selected data source (${contentType}) is empty`);
      return;
    }

    const currentDate = new Date();
    
    const filterData = () => {
      switch (timeRange) {
        case 'all':
          return [...sourceData];
        case 'year':
          const oneYearAgo = new Date(
            currentDate.getFullYear() - 1,
            currentDate.getMonth(),
            currentDate.getDate()
          );
          return sourceData.filter(item => new Date(item.date) >= oneYearAgo);
        case '6months':
          const sixMonthsAgo = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() - 6,
            currentDate.getDate()
          );
          return sourceData.filter(item => new Date(item.date) >= sixMonthsAgo);
        default:
          return [...sourceData];
      }
    };

    const filtered = filterData();
    console.log(`Filtered ${contentType} data: ${filtered.length} items`);
    setFilteredData(filtered);
  }, [data, updatedData, timeRange, contentType]);

  return (
    <div className="w-full rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <Select value={contentType} onValueChange={(value) => setContentType(value as ContentType)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Content type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>View</SelectLabel>
                <SelectItem value="new">New Content</SelectItem>
                <SelectItem value="updated">New & Updated</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Time Range</SelectLabel>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="year">Past Year</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="h-[400px]" role="img" aria-label="Line chart showing content publication trends over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filteredData}
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
              formatter={(value) => [`${value} entries`, contentType === 'new' ? "New Content" : "New & Updated Content"]}
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
              name={contentType === 'new' ? "New Content" : "New & Updated Content"}
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
