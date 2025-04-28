import { CollectionProp, Entry, EntryProps } from 'contentful-management';

interface ScheduledAction {
  sys: {
    type: string;
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  scheduledFor: {
    datetime: string;
    timezone: string;
  };
  action: string;
  entity: {
    sys: {
      type: string;
      linkType: string;
      id: string;
    };
  };
  release?: {
    entities: {
      items: Array<{
        sys: {
          id: string;
          type: string;
        };
      }>;
    };
  };
}

interface ContentStats {
  totalPublished: number;
  percentChange: number;
  scheduledCount: number;
  recentlyPublishedCount: number;
  needsUpdateCount: number;
  previousMonthPublished: number;
}

type ContentfulEntry = EntryProps & {
  sys: EntryProps['sys'] & {
    publishedAt?: string;
  };
};

export const getContentStats = async (entries: CollectionProp<EntryProps>, actions: any[]): Promise<ContentStats> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  console.log('Processing entries:', entries.items.length);
  console.log('Sample entry sys:', entries.items[0]?.sys);

  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    console.log('Entry publish date:', entry.sys.publishedAt);
    return entry.sys.publishedAt;
  });

  console.log('Published entries:', publishedEntries.length);

  // Calculate total published
  const totalPublished = publishedEntries.length;

  // Calculate percent change (comparing current month to previous month)
  const thisMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= thirtyDaysAgo;
  }).length;

  console.log('This month published:', thisMonthPublished);

  const previousMonthStart = new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const previousMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= previousMonthStart && publishDate < thirtyDaysAgo;
  }).length;

  console.log('Previous month published:', previousMonthPublished);

  const percentChange = previousMonthPublished === 0 
    ? 0
    : ((thisMonthPublished - previousMonthPublished) / previousMonthPublished) * 100;

  // Get scheduled count - including both individual entries and entries in releases
  console.log('Processing scheduled actions:', actions?.length);
  console.log('Sample action:', actions?.[0]);

  // Track unique entry IDs that are scheduled
  const scheduledEntryIds = new Set<string>();

  actions?.forEach((action: ScheduledAction) => {
    // Only process actions that:
    // 1. Have status 'scheduled'
    // 2. Are scheduled for the future
    // 3. Are publish actions
    if (action.sys.status === 'scheduled' && 
        new Date(action.scheduledFor.datetime) > now &&
        action.action === 'publish') {
      
      if (action.entity.sys.linkType === 'Entry') {
        // Individual scheduled entry
        scheduledEntryIds.add(action.entity.sys.id);
      } else if (action.entity.sys.linkType === 'Release') {
        // For releases, we need to add all entries that are part of the release
        // The entries should be available in the release entities
        const releaseEntities = action.release?.entities?.items || [];
        releaseEntities.forEach((entity: any) => {
          if (entity.sys?.id) {
            scheduledEntryIds.add(entity.sys.id);
          }
        });
      }
    }
  });

  const scheduledCount = scheduledEntryIds.size;
  console.log('Total scheduled entries:', scheduledCount);

  // Get recently published count (last 7 days)
  const recentlyPublishedCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= sevenDaysAgo;
  }).length;

  console.log('Recently published count:', recentlyPublishedCount);

  // Get needs update count (published more than 6 months ago)
  const needsUpdateCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate <= sixMonthsAgo;
  }).length;

  console.log('Needs update count:', needsUpdateCount);

  return {
    totalPublished,
    percentChange,
    scheduledCount,
    recentlyPublishedCount,
    needsUpdateCount,
    previousMonthPublished,
  };
};

export const generateChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.publishedAt;
  });

  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.publishedAt) {
      const publishDate = new Date(entry.sys.publishedAt);
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Convert to array format for chart
  const chartData = Object.entries(entriesByMonth)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // If we have data, ensure we have at least 12 months of data
  if (chartData.length > 0) {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    
    // Use the earliest date between 12 months ago and the first entry date
    const firstDate = new Date(Math.min(
      twelveMonthsAgo.getTime(),
      new Date(chartData[0].date).getTime()
    ));
    
    // Use the latest date between now and the last entry date
    const lastDate = new Date(Math.max(
      now.getTime(),
      new Date(chartData[chartData.length - 1].date).getTime()
    ));
    
    // Create a complete array of months between first and last date
    const completeData: Array<{ date: string; count: number }> = [];
    let currentDate = new Date(firstDate);
    
    while (currentDate <= lastDate) {
      const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
      const existingData = chartData.find(item => item.date === monthKey);
      
      completeData.push({
        date: monthKey,
        count: existingData ? existingData.count : 0
      });
      
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return completeData;
  }
  
  return chartData;
}; 