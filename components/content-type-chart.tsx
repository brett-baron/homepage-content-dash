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

// Format date for display
const formatDate = (dateString: string) => {
  const [year, month] = dateString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface ContentTypeChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  updatedData: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  contentTypes: string[];
  selectedTimeRange: 'all' | 'year' | '6months';
  selectedContentType: 'new' | 'updated';
  title?: 'Content Types' | 'Authors';
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const formattedDate = formatDate(label);
    
    // Sort payload by value (count) in descending order
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
    
    return (
      <div className="bg-white p-3 rounded-lg shadow-md border border-gray-100">
        <p className="font-semibold">{formattedDate}</p>
        {sortedPayload.map((item: any, index: number) => (
          <p key={index} style={{ color: item.color }}>
            {`${item.name}: ${item.value} entries`}
          </p>
        ))}
      </div>
    );
  }
  
  return null;
};

// Array of colors for the lines
const lineColors = [
  "#3b82f6", // blue-500
  "#ef4444", // red-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#84cc16", // lime-500
];

// Import the correct type from recharts
type LabelProps = {
  x?: string | number;
  y?: string | number;
  value?: string | number;
  index?: number;
};

export default function ContentTypeChart({
  data = [],
  updatedData = [],
  contentTypes = [],
  selectedTimeRange,
  selectedContentType,
  title = 'Content Types'
}: ContentTypeChartProps) {
  const [filteredData, setFilteredData] = useState(data);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 10]);
  const [activeContentTypes, setActiveContentTypes] = useState<string[]>([]);
  const [processedData, setProcessedData] = useState<Array<{ date: string; [key: string]: any; highestType?: string }>>([]);

  useEffect(() => {
    // Select the appropriate data source based on selectedContentType
    const sourceData = selectedContentType === 'new' ? data : updatedData;
    
    if (!sourceData || sourceData.length === 0) {
      return;
    }

    const currentDate = new Date();
    
    const filterData = () => {
      switch (selectedTimeRange) {
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
    
    // Find content types that have non-zero values in the filtered data
    const activeTypes = contentTypes;  // Show all tracked types, even if they have no data
    setActiveContentTypes(activeTypes);

    // Process data to identify highest value for each date
    const processed = filtered.map(item => {
      const values = activeTypes.map(type => ({ type, value: Number(item[type]) || 0 }));
      const highest = values.reduce((max, curr) => curr.value > max.value ? curr : max, { type: '', value: -1 });
      return {
        ...item,
        highestType: highest.type,
        highestValue: highest.value
      };
    });

    setProcessedData(processed);
    setFilteredData(filtered);
    
    // Calculate appropriate y-axis range using only active content types
    if (filtered.length > 0) {
      const maxCount = Math.max(
        ...filtered.flatMap(item => 
          activeTypes.map(type => Number(item[type]) || 0)
        )
      );
      
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
      
      const highestUsedInterval = Math.ceil(maxCount / intervalSize) * intervalSize;
      const upperBound = highestUsedInterval + intervalSize;
      setYAxisDomain([0, upperBound]);
    } else {
      setYAxisDomain([0, 20]);
    }
  }, [data, updatedData, selectedTimeRange, selectedContentType, contentTypes]);

  return (
    <div className="flex gap-8">
      <div className="flex-1 h-[400px]" role="img" aria-label="Line chart showing content type trends over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={processedData}
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
            <Tooltip content={<CustomTooltip />} />
            {activeContentTypes.map((contentType, index) => (
              <Line
                key={contentType}
                type="monotone"
                dataKey={contentType}
                name={contentType}
                stroke={lineColors[index % lineColors.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              >
                <LabelList
                  dataKey={contentType}
                  position="top"
                  offset={10}
                  content={(props: LabelProps) => {
                    const { x, y, value, index } = props;
                    
                    if (typeof index !== 'number' || !processedData[index] || processedData[index].highestType !== contentType) {
                      return null;
                    }

                    const xPos = typeof x === 'number' ? x : parseFloat(x || '0');
                    const yPos = typeof y === 'number' ? y : parseFloat(y || '0');
                    const val = typeof value === 'number' ? value : parseFloat(value || '0');

                    return (
                      <text 
                        x={xPos} 
                        y={yPos - 10}
                        textAnchor="middle"
                        fill="#374151"
                        fontSize="15"
                      >
                        {val}
                      </text>
                    );
                  }}
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend on the right */}
      <div className="w-48 flex flex-col gap-3 py-4">
        <div className="text-sm font-medium text-muted-foreground">{title}:</div>
        {activeContentTypes.map((contentType, index) => (
          <div key={contentType} className="flex items-center gap-2">
            <div 
              className="h-3 w-3 rounded-full" 
              style={{ backgroundColor: lineColors[index % lineColors.length] }}
            />
            <span className="text-sm truncate" title={contentType}>{contentType}</span>
          </div>
        ))}
      </div>
    </div>
  );
} 