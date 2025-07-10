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
  selectedTimeRange: 'all' | 'year' | '6months'
}

// Custom tooltip component to show percentage change
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formattedDate = formatDate(label);
    const count = data.count;
    const percentChange = data.percentChange;
    
    return (
      <div className="bg-white p-3 rounded-lg shadow-md border border-gray-100">
        <p className="font-semibold">{formattedDate}</p>
        <p>{`${count} new entries`}</p>
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
  selectedTimeRange,
}: ContentChartProps) {
  const [filteredData, setFilteredData] = useState(data);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 10]);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  // Handle line selection
  const handleLineClick = (lineName: string) => {
    setSelectedLine(selectedLine === lineName ? null : lineName);
  };

  // Handle legend click
  const handleLegendClick = (lineName: string) => {
    setSelectedLine(selectedLine === lineName ? null : lineName);
  };

  useEffect(() => {
    // Return early if data is empty
    if (!data || data.length === 0) {
      console.log('Data source is empty');
      return;
    }

    const currentDate = new Date();
    
    const filterData = () => {
      switch (selectedTimeRange) {
        case 'all':
          return [...data];
        case 'year':
          // Get the start of the month 12 months ago
          const oneYearAgo = new Date(
            currentDate.getFullYear() - 1,
            currentDate.getMonth(),
            1 // First day of the month
          );
          return data.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= oneYearAgo;
          });
        case '6months':
          // Get the start of the month 6 months ago
          const sixMonthsAgo = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() - 6,
            1 // First day of the month
          );
          return data.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= sixMonthsAgo;
          });
        default:
          return [...data];
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
  }, [data, selectedTimeRange]);

  return (
    <div className="flex gap-8">
      <div className="flex-1 h-[400px]" role="img" aria-label="Line chart showing content publication trends over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filteredData}
            margin={{
              top: 10,
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
              content={<CustomTooltip />}
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
              name="New Content"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              onClick={() => handleLineClick("New Content")}
              style={{ cursor: 'pointer' }}
            >
              <LabelList 
                dataKey="count" 
                position="top" 
                offset={10}
                className="fill-foreground" 
                fontSize={15}
                formatter={(value: number) => value}
                style={{
                  fill: "#374151",
                  fontSize: "15px",
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend on the right */}
      <div className="w-48 flex flex-col gap-3 py-4">
        <div className="text-sm font-medium text-muted-foreground">Content:</div>
        <div 
          key="all-entries" 
          className={`flex items-center gap-2 cursor-pointer p-2 rounded transition-colors ${
            selectedLine === "New Content" ? "bg-blue-100" : "hover:bg-gray-100"
          }`}
          onClick={() => handleLegendClick("New Content")}
        >
          <div 
            className="h-3 w-3 rounded-full" 
            style={{ backgroundColor: "#3b82f6" }}
          />
          <span className="text-sm truncate" title="New Content">
            New Content
          </span>
        </div>
      </div>
    </div>
  )
}
