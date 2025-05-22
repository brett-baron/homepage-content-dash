import { CollectionProp, Entry, EntryProps } from 'contentful-management';
import { calculatePercentageChange } from './calculations';

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
    firstPublishedAt?: string;
  };
};

export const getContentStats = async (
  entries: CollectionProp<EntryProps>, 
  actions: any[],
  recentlyPublishedDays: number = 7,
  needsUpdateMonths: number = 6
): Promise<ContentStats> => {
  const now = new Date();
  
  // Calculate the start of the current and previous months for more accurate monthly comparisons
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  // For other calculations (configured days, needs update months)
  const recentlyPublishedDate = new Date(now.getTime() - recentlyPublishedDays * 24 * 60 * 60 * 1000);
  const needsUpdateDate = new Date(now.getTime() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000);

  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => entry.sys.publishedAt);

  // Calculate total published
  const totalPublished = publishedEntries.length;

  // Calculate entries first published in current month and previous month
  const thisMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= currentMonth;
  }).length;

  const previousMonthPublished = publishedEntries.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= previousMonth && firstPublishDate < currentMonth;
  }).length;

  // Calculate percent change
  let percentChange = 0;
  if (previousMonthPublished > 0) {
    percentChange = ((thisMonthPublished - previousMonthPublished) / previousMonthPublished) * 100;
  } else if (thisMonthPublished > 0) {
    percentChange = 100; // If nothing published last month but we have content this month, show 100% increase
  }

  // Track unique entry IDs that are scheduled
  const scheduledEntryIds = new Set<string>();

  actions?.forEach((action: ScheduledAction) => {
    if (action.sys.status === 'scheduled' && 
        new Date(action.scheduledFor.datetime) > now &&
        action.action === 'publish') {
      
      if (action.entity.sys.linkType === 'Entry') {
        scheduledEntryIds.add(action.entity.sys.id);
      } else if (action.entity.sys.linkType === 'Release') {
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

  // Get recently published count (based on configured days)
  const recentlyPublishedCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= recentlyPublishedDate;
  }).length;

  // Get needs update count (published more than configured months ago)
  const needsUpdateCount = publishedEntries.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate <= needsUpdateDate;
  }).length;

  return {
    totalPublished,
    percentChange,
    scheduledCount,
    recentlyPublishedCount,
    needsUpdateCount,
    previousMonthPublished,
  };
};

// Optimized function to get content stats using combined API calls
export const getContentStatsPaginated = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  actions: any[],
  recentlyPublishedDays: number = 7,
  needsUpdateMonths: number = 6,
  excludedContentTypes: string[] = []
): Promise<ContentStats> => {
  const now = new Date();
  
  // Calculate all required dates at once
  const dates = {
    currentMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    previousMonth: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    recentlyPublished: new Date(now.getTime() - recentlyPublishedDays * 24 * 60 * 60 * 1000),
    needsUpdate: new Date(now.getTime() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000)
  };

  // Build content type exclusion string for queries
  const contentTypeExclusion = excludedContentTypes.length > 0 
    ? `&sys.contentType.sys.id[nin]=${excludedContentTypes.join(',')}`
    : '';

  // Make parallel API calls for different metrics
  const [totalPublished, monthlyStats, recentAndNeedsUpdate] = await Promise.all([
    // 1. Get total published count
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    }),

    // 2. Combined query for current and previous month stats
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.firstPublishedAt[gte]': dates.previousMonth.toISOString(),
        'sys.publishedAt[exists]': true,
        limit: 1000, // Increased limit to ensure we get all entries for accurate counting
        order: 'sys.firstPublishedAt'
      }
    }),

    // 3. Combined query for recently published and needs update
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        limit: 1000,
        order: 'sys.publishedAt'
      }
    })
  ]);

  // Process monthly stats
  const thisMonthPublished = monthlyStats.items.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= dates.currentMonth;
  }).length;

  const previousMonthPublished = monthlyStats.items.filter((entry: ContentfulEntry) => {
    const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
    return firstPublishDate >= dates.previousMonth && firstPublishDate < dates.currentMonth;
  }).length;

  // Calculate percent change
  const percentChange = calculatePercentageChange(thisMonthPublished, previousMonthPublished);

  // Process recent and needs update counts
  const recentlyPublishedCount = recentAndNeedsUpdate.items.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate >= dates.recentlyPublished;
  }).length;

  const needsUpdateCount = recentAndNeedsUpdate.items.filter((entry: ContentfulEntry) => {
    const publishDate = new Date(entry.sys.publishedAt!);
    return publishDate <= dates.needsUpdate;
  }).length;

  // Calculate scheduled count from actions
  const scheduledEntryIds = new Set<string>();
  actions?.forEach((action: ScheduledAction) => {
    if (action.sys.status === 'scheduled' && 
        new Date(action.scheduledFor.datetime) > now &&
        action.action === 'publish') {
      
      if (action.entity.sys.linkType === 'Entry') {
        scheduledEntryIds.add(action.entity.sys.id);
      } else if (action.entity.sys.linkType === 'Release') {
        action.release?.entities?.items?.forEach((entity: any) => {
          if (entity.sys?.id) {
            scheduledEntryIds.add(entity.sys.id);
          }
        });
      }
    }
  });

  return {
    totalPublished: totalPublished.total,
    percentChange,
    scheduledCount: scheduledEntryIds.size,
    recentlyPublishedCount,
    needsUpdateCount,
    previousMonthPublished,
  };
};

// Fetch limited page of entries that match specific criteria
export const fetchEntriesByType = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  query: object,
  limit: number = 100,
  page: number = 1
): Promise<CollectionProp<EntryProps>> => {
  const skip = (page - 1) * limit;
  
  return cma.entry.getMany({
    spaceId,
    environmentId,
    query: {
      ...query,
      skip,
      limit
    }
  });
};

// Generate chart data showing first published dates (new content)
export const generateChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number; percentChange?: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.firstPublishedAt;
  });
  
  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  // Define the oldest date
  let oldestPublishDate: string | null = null;

  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      
      // Track the oldest date as a string for simple comparison
      if (!oldestPublishDate || entry.sys.firstPublishedAt < oldestPublishDate) {
        oldestPublishDate = entry.sys.firstPublishedAt;
      }
      
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Make sure we have a date range to work with
  const now = new Date();
  // June 11, 2024 is known to be the oldest content publish date
  const minDate = new Date(2024, 5, 1); // June 1, 2024 (zero-indexed month)
  
  // Convert the oldest publish date to a Date object
  let oldestDate: Date | null = null;
  if (oldestPublishDate) {
    oldestDate = new Date(oldestPublishDate);
    
    // Use the earlier of our known min date or the actual oldest date
    if (oldestDate < minDate) {
      minDate.setTime(oldestDate.getTime());
      minDate.setDate(1); // Set to first of the month
    }
  }
  
  // Create array of all months from min date to current date
  const months: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  
  while (monthDate <= currentDate) {
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const existingCount = entriesByMonth[monthKey] || 0;
    
    months.push({
      date: monthKey,
      count: existingCount
    });
    
    // Advance to next month
    monthDate.setMonth(monthDate.getMonth() + 1);
  }
  
  // Calculate month-over-month percent changes
  const monthsWithPercentChange = months.map((month, index, array) => {
    if (index === 0) {
      return { ...month, percentChange: 0 };
    }
    
    const prevCount = array[index - 1].count;
    const percentChange = calculatePercentageChange(month.count, prevCount);
    
    return { ...month, percentChange };
  });
  
  return monthsWithPercentChange;
};

// Fetch chart data directly from the API with filters and configurable time range
export const fetchChartData = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  options: {
    monthsToShow?: number;
    excludedContentTypes?: string[];
  } = {}
): Promise<Array<{ date: string; count: number; percentChange?: number }>> => {
  const { 
    monthsToShow = 12, // Default to showing 12 months of data
    excludedContentTypes = []
  } = options;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(now.getMonth() - monthsToShow + 1);
  startDate.setDate(1); // First day of the month
  
  // Build content type exclusion for queries
  const contentTypeParams = excludedContentTypes.length > 0
    ? `&sys.contentType.sys.id[nin]=${excludedContentTypes.join(',')}`
    : '';
  
  // Instead of making a separate API call for each month,
  // make one call for the entire date range and process the results
  const response = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: {
      'sys.firstPublishedAt[gte]': startDate.toISOString(),
      'sys.publishedAt[exists]': true,
      limit: 1000,
      order: 'sys.firstPublishedAt'
    }
  });

  // Create a map to store counts by month
  const monthCounts: Record<string, number> = {};
  
  // Initialize all months with zero counts
  let currentMonth = new Date(startDate);
  while (currentMonth <= now) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    monthCounts[monthKey] = 0;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Count entries by month
  response.items.forEach((entry: ContentfulEntry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (monthCounts[monthKey] !== undefined) {
        monthCounts[monthKey]++;
      }
    }
  });

  // Convert to array format and calculate percent changes
  const result = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count], index, array) => {
      if (index === 0) {
        return { date, count, percentChange: 0 };
      }
      
      const prevCount = array[index - 1][1];
      const percentChange = calculatePercentageChange(count, prevCount);
      
      return { date, count, percentChange };
    });

  return result;
};

// Generate chart data showing updated dates (any content updates)
export const generateUpdatedChartData = (entries: CollectionProp<EntryProps>): Array<{ date: string; count: number; percentChange?: number }> => {
  // Get published entries
  const publishedEntries = entries.items.filter((entry: ContentfulEntry) => {
    return entry.sys.updatedAt;
  });
  
  // Group entries by month
  const entriesByMonth: Record<string, number> = {};
  
  // Define the oldest date
  let oldestUpdateDate: string | null = null;

  publishedEntries.forEach((entry: ContentfulEntry) => {
    if (entry.sys.updatedAt) {
      const updateDate = new Date(entry.sys.updatedAt);
      
      // Track the oldest date as a string for simple comparison
      if (!oldestUpdateDate || entry.sys.updatedAt < oldestUpdateDate) {
        oldestUpdateDate = entry.sys.updatedAt;
      }
      
      // Format as YYYY-MM-01 to group by month
      const monthKey = `${updateDate.getFullYear()}-${String(updateDate.getMonth() + 1).padStart(2, '0')}-01`;
      
      entriesByMonth[monthKey] = (entriesByMonth[monthKey] || 0) + 1;
    }
  });

  // Make sure we have a date range to work with
  const now = new Date();
  // June 11, 2024 is known to be the oldest content update date
  const minDate = new Date(2024, 5, 1); // June 1, 2024 (zero-indexed month)
  
  // Convert the oldest update date to a Date object
  let oldestDate: Date | null = null;
  if (oldestUpdateDate) {
    oldestDate = new Date(oldestUpdateDate);
    
    // Use the earlier of our known min date or the actual oldest date
    if (oldestDate < minDate) {
      minDate.setTime(oldestDate.getTime());
      minDate.setDate(1); // Set to first of the month
    }
  }
  
  // Create array of all months from min date to current date
  const months: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  
  while (monthDate <= currentDate) {
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    const existingCount = entriesByMonth[monthKey] || 0;
    
    months.push({
      date: monthKey,
      count: existingCount
    });
    
    // Advance to next month
    monthDate.setMonth(monthDate.getMonth() + 1);
  }
  
  // Calculate month-over-month percent changes
  const monthsWithPercentChange = months.map((month, index, array) => {
    if (index === 0) {
      return { ...month, percentChange: 0 };
    }
    
    const prevCount = array[index - 1].count;
    const percentChange = calculatePercentageChange(month.count, prevCount);
    
    return { ...month, percentChange };
  });
  
  return monthsWithPercentChange;
}; 