import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts"
import { useState, useEffect } from "react"
import { calculatePercentageChange, formatPercentageChange } from "../utils/calculations"
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
  data?: Array<{ date: string; count: number; percentChange?: number }>
  updatedData?: Array<{ date: string; count: number; percentChange?: number }>
  title?: string
  description?: string
}

type TimeRange = 'all' | 'year' | '6months';
type ContentType = 'new' | 'updated';

// Custom tooltip component to show percentage change
const CustomTooltip = ({ active, payload, label, contentType }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formattedDate = formatDate(label);
    const count = data.count;
    const percentChange = data.percentChange;
    
    return (
      <div className="bg-white p-3 rounded-lg shadow-md border border-gray-100">
        <p className="font-semibold">{formattedDate}</p>
        <p>{`${count} ${contentType === 'new' ? "new entries" : "entries published or updated"}`}</p>
        {percentChange !== undefined && (
          <p className={`text-sm ${percentChange >= 0 ? "text-green-500" : "text-red-500"}`}>
            {formatPercentageChange(percentChange)} from previous month
          </p>
        )}
      </div>
    );
  }
  
  return null;
};

export default function ContentChart({
  data = [],
  updatedData = [],
  title,
  description,
}: ContentChartProps) {
  // Get the default time range from localStorage if available
  const getDefaultTimeRange = (): TimeRange => {
    try {
      const storedConfig = localStorage.getItem('contentDashboardConfig');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        if (parsedConfig && parsedConfig.defaultTimeRange && 
            ['all', 'year', '6months'].includes(parsedConfig.defaultTimeRange)) {
          return parsedConfig.defaultTimeRange as TimeRange;
        }
      }
    } catch (error) {
      console.error('Error reading default time range from config:', error);
    }
    return 'year'; // Fallback to default
  };

  const [timeRange, setTimeRange] = useState<TimeRange>(getDefaultTimeRange());
  const [contentType, setContentType] = useState<ContentType>('new');
  const [filteredData, setFilteredData] = useState(data);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 10]);

  // Calculate percent changes for each month
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
    
    // Calculate month-over-month percentage changes using shared utility
    const filteredWithPercentage = filtered.map((item, index, array) => {
      if (index === 0 || array.length <= 1) {
        return { ...item, percentChange: 0 };
      }
      
      const prevCount = array[index - 1].count;
      const percentChange = calculatePercentageChange(item.count, prevCount);
      
      return { ...item, percentChange };
    });
    setFilteredData(filteredWithPercentage);
    
    // Calculate appropriate y-axis range with consistent intervals
    if (filteredWithPercentage.length > 0) {
      const maxCount = Math.max(...filteredWithPercentage.map(item => item.count));
      
      // Dynamically determine interval size based on the max value
      let intervalSize;
      if (maxCount <= 20) {
        intervalSize = 10;
      } else if (maxCount <= 50) {
        intervalSize = 20;
      } else if (maxCount <= 100) {
        intervalSize = 25;
      } else if (maxCount <= 500) {
        intervalSize = 100;
      } else {
        intervalSize = 250;
      }
      
      // Round up to the next multiple of the interval
      const highestUsedInterval = Math.ceil(maxCount / intervalSize) * intervalSize;
      // Add one full interval above the highest used interval
      const upperBound = highestUsedInterval + intervalSize;
      setYAxisDomain([0, upperBound]);
    } else {
      setYAxisDomain([0, 20]);
    }
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
                <SelectItem value="updated">New or Updated</SelectItem>
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
              top: 30,
              right: 30,
              left: 20,
              bottom: 25,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} angle={-45} textAnchor="end" />
            <YAxis 
              tick={{ fontSize: 12 }} 
              domain={yAxisDomain}
              tickCount={Math.min(5, Math.floor(yAxisDomain[1] / 10) + 1)}
              allowDecimals={false}
            />
            <Tooltip 
              content={<CustomTooltip contentType={contentType} />}
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
            >
              <LabelList 
                dataKey="count" 
                position="top" 
                offset={10}
                className="fill-foreground" 
                fontSize={15}
                formatter={(value: number) => value}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
