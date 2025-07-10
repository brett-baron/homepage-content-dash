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
  contentTypes: string[];
  selectedTimeRange: 'all' | 'year' | '6months';
  title?: 'Content Types' | 'Authors' | 'Creators';
}

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
  contentTypes = [],
  selectedTimeRange,
  title = 'Content Types'
}: ContentTypeChartProps) {
  const [filteredData, setFilteredData] = useState(data);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 10]);
  const [activeContentTypes, setActiveContentTypes] = useState<string[]>([]);
  const [processedData, setProcessedData] = useState<Array<{ date: string; [key: string]: any; highestType?: string }>>([]);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  // Handle line selection
  const handleLineClick = (lineName: string) => {
    setSelectedLine(selectedLine === lineName ? null : lineName);
  };

  // Handle legend click
  const handleLegendClick = (lineName: string) => {
    setSelectedLine(selectedLine === lineName ? null : lineName);
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const formattedDate = formatDate(label);
      
      // If a line is selected, show only that line's data
      if (selectedLine) {
        const selectedData = payload.find((item: any) => item.name === selectedLine);
        if (selectedData) {
          const data = selectedData.payload;
          const count = selectedData.value;
          const percentChange = data[`${selectedLine}_percentChange`];
          
          return (
            <div className="bg-white p-3 rounded-lg shadow-md border border-gray-100">
              <p className="font-semibold">{formattedDate}</p>
              <p style={{ color: selectedData.color }}>
                {`${selectedLine}: ${count} entries`}
              </p>
              {percentChange !== undefined && (
                <p className={`text-sm ${percentChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {formatPercentageChange(percentChange)} from previous month
                </p>
              )}
            </div>
          );
        }
      }
      
      // Default behavior when no line is selected - show all active lines
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

  useEffect(() => {
    if (!data || data.length === 0) {
      console.log('No data available');
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
    
    // Find content types that have non-zero values in the filtered data
    const activeTypes = contentTypes.filter(type => 
      filtered.some(item => Number(item[type]) > 0)
    );
    setActiveContentTypes(activeTypes);

    // Calculate month-over-month percentage changes for each content type
    const filteredWithPercentages = filtered.map((item, index, array) => {
      const enhancedItem = { ...item };
      
      // Calculate percentage change for each active content type
      activeTypes.forEach(type => {
        if (index === 0 || array.length <= 1) {
          enhancedItem[`${type}_percentChange`] = 0;
        } else {
          const currentCount = Number(item[type]) || 0;
          const prevCount = Number(array[index - 1][type]) || 0;
          const percentChange = calculatePercentageChange(currentCount, prevCount);
          enhancedItem[`${type}_percentChange`] = percentChange;
        }
      });
      
      return enhancedItem;
    });

    // Process data to identify highest value for each date
    const processed = filteredWithPercentages.map(item => {
      const values = activeTypes.map(type => ({ type, value: Number(item[type]) || 0 }));
      const highest = values.reduce((max, curr) => curr.value > max.value ? curr : max, { type: '', value: -1 });
      return {
        ...item,
        highestType: selectedLine || highest.type,
        highestValue: highest.value
      };
    });
    setProcessedData(processed);
    setFilteredData(filteredWithPercentages);
    
    // Calculate appropriate y-axis range using only active content types
    if (filteredWithPercentages.length > 0) {
      const maxCount = Math.max(
        ...filteredWithPercentages.flatMap(item => 
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
  }, [data, selectedTimeRange, contentTypes, selectedLine]);

  return (
    <>
      <div className="flex gap-8">
        <div className="flex-1 h-[400px]" role="img" aria-label="Line chart showing content type trends over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={processedData}
              margin={{
                top: 20,
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
                  onClick={() => handleLineClick(contentType)}
                  style={{ 
                    cursor: 'pointer',
                    opacity: selectedLine && selectedLine !== contentType ? 0.3 : 1
                  }}
                >
                  <LabelList
                    dataKey={contentType}
                    position="top"
                    offset={10}
                    content={(props: LabelProps) => {
                      const { x, y, value, index } = props;
                      
                      // Show labels only for selected line or highest value when no selection
                      if (typeof index !== 'number' || !processedData[index]) {
                        return null;
                      }

                      const shouldShowLabel = selectedLine 
                        ? selectedLine === contentType 
                        : processedData[index].highestType === contentType;

                      if (!shouldShowLabel) {
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
            <div 
              key={contentType} 
              className={`flex items-center gap-2 cursor-pointer p-2 rounded transition-colors ${
                selectedLine === contentType ? "bg-blue-100" : "hover:bg-gray-100"
              }`}
              onClick={() => handleLegendClick(contentType)}
              style={{
                opacity: selectedLine && selectedLine !== contentType ? 0.5 : 1
              }}
            >
              <div 
                className="h-3 w-3 rounded-full" 
                style={{ backgroundColor: lineColors[index % lineColors.length] }}
              />
              <span className="text-sm truncate" title={contentType}>{contentType}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
} 