import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

// Combined workflow and stage data
const workflowStageData = [
  {
    name: "Blog Posts",
    Draft: 8,
    "In Review": 6,
    Approved: 4,
    Scheduled: 5,
    Published: 19,
    "Needs Update": 4,
  },
  {
    name: "Social Media",
    Draft: 12,
    "In Review": 8,
    Approved: 3,
    Scheduled: 7,
    Published: 6,
    "Needs Update": 0,
  },
  {
    name: "Documentation",
    Draft: 3,
    "In Review": 2,
    Approved: 1,
    Scheduled: 0,
    Published: 12,
    "Needs Update": 6,
  },
  {
    name: "Press Releases",
    Draft: 2,
    "In Review": 3,
    Approved: 2,
    Scheduled: 4,
    Published: 7,
    "Needs Update": 0,
  },
  {
    name: "Case Studies",
    Draft: 1,
    "In Review": 2,
    Approved: 1,
    Scheduled: 2,
    Published: 6,
    "Needs Update": 2,
  },
  {
    name: "Newsletters",
    Draft: 2,
    "In Review": 1,
    Approved: 1,
    Scheduled: 2,
    Published: 4,
    "Needs Update": 0,
  },
]

// Colors for each stage
const stageColors = {
  Draft: "#94a3b8",
  "In Review": "#f59e0b",
  Approved: "#10b981",
  Scheduled: "#3b82f6",
  Published: "#8b5cf6",
  "Needs Update": "#ef4444",
}

export function WorkflowStageChart() {
  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={workflowStageData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                // Calculate total for this workflow
                const total = payload.reduce((sum, entry) => sum + ((entry.value as number) || 0), 0)

                return (
                  <div className="rounded-lg border bg-background p-4 shadow-sm">
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-muted-foreground mb-2">Total: {total} items</p>
                    <div className="space-y-1">
                      {payload.map((entry, index) =>
                        entry.value > 0 ? (
                          <div key={`item-${index}`} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-xs">{entry.name}: </span>
                            </div>
                            <span className="text-xs font-medium">{entry.value}</span>
                          </div>
                        ) : null,
                      )}
                    </div>
                  </div>
                )
              }
              return null
            }}
          />
          <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} />
          <Bar dataKey="Draft" stackId="a" fill={stageColors["Draft"]} />
          <Bar dataKey="In Review" stackId="a" fill={stageColors["In Review"]} />
          <Bar dataKey="Approved" stackId="a" fill={stageColors["Approved"]} />
          <Bar dataKey="Scheduled" stackId="a" fill={stageColors["Scheduled"]} />
          <Bar dataKey="Published" stackId="a" fill={stageColors["Published"]} />
          <Bar dataKey="Needs Update" stackId="a" fill={stageColors["Needs Update"]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
