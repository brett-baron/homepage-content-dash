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

// Optimized function to get content stats using separate API calls with filters
// This is more scalable for spaces with millions of entries
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
  
  // Calculate the start of the current and previous months
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  // Calculate dates for filters
  const recentlyPublishedDate = new Date(now.getTime() - recentlyPublishedDays * 24 * 60 * 60 * 1000);
  const needsUpdateDate = new Date(now.getTime() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000);

  // Build content type exclusion string for queries if any types are excluded
  let contentTypeExclusion = '';
  if (excludedContentTypes.length > 0) {
    contentTypeExclusion = `&sys.contentType.sys.id[nin]=${excludedContentTypes.join(',')}`;
  }

  // 1. Get total published count
  const totalPublishedResponse = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: {
      'sys.publishedAt[exists]': true,
      limit: 1 // We only need the total
    }
  });
  const totalPublished = totalPublishedResponse.total;

  // 2. Get current month published count
  const currentMonthQuery = {
    'sys.firstPublishedAt[gte]': currentMonth.toISOString(),
    'sys.publishedAt[exists]': true,
    limit: 1
  };
  
  const currentMonthResponse = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: currentMonthQuery
  });
  const thisMonthPublished = currentMonthResponse.total;

  // 3. Get previous month published count
  const previousMonthQuery = {
    'sys.firstPublishedAt[gte]': previousMonth.toISOString(),
    'sys.firstPublishedAt[lt]': currentMonth.toISOString(),
    'sys.publishedAt[exists]': true,
    limit: 1
  };
  
  const previousMonthResponse = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: previousMonthQuery
  });
  const previousMonthPublished = previousMonthResponse.total;

  // Calculate percent change using shared utility
  const percentChange = calculatePercentageChange(thisMonthPublished, previousMonthPublished);

  // 4. Get recently published count
  const recentlyPublishedQuery = {
    'sys.publishedAt[gte]': recentlyPublishedDate.toISOString(),
    limit: 1
  };
  
  const recentlyPublishedResponse = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: recentlyPublishedQuery
  });
  const recentlyPublishedCount = recentlyPublishedResponse.total;

  // 5. Get needs update count
  const needsUpdateQuery = {
    'sys.publishedAt[lte]': needsUpdateDate.toISOString(),
    'sys.updatedAt[lte]': needsUpdateDate.toISOString(),
    limit: 1
  };
  
  const needsUpdateResponse = await cma.entry.getMany({
    spaceId,
    environmentId,
    query: needsUpdateQuery
  });
  const needsUpdateCount = needsUpdateResponse.total;

  // 6. Calculate scheduled count from actions
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

  return {
    totalPublished,
    percentChange,
    scheduledCount,
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

// Fetch chart data directly from the API with filters
export const fetchChartData = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  excludedContentTypes: string[] = []
): Promise<Array<{ date: string; count: number; percentChange?: number }>> => {
  const now = new Date();
  const startDate = new Date(2024, 5, 1); // June 1, 2024 as default start
  
  // Create array of all months from start date to current date
  const months: Array<{ date: string; count: number }> = [];
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  
  // Build content type exclusion for queries
  let contentTypeParams = '';
  if (excludedContentTypes.length > 0) {
    contentTypeParams = `&sys.contentType.sys.id[nin]=${excludedContentTypes.join(',')}`;
  }
  
  // Fetch counts for each month in parallel
  const monthPromises = [];
  
  while (monthDate <= currentDate) {
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    
    // Query for entries first published in this month
    const promise = cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.firstPublishedAt[gte]': monthDate.toISOString(),
        'sys.firstPublishedAt[lt]': nextMonth.toISOString(),
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    }).then((response: { total: number }) => ({
      date: monthKey,
      count: response.total
    }));
    
    monthPromises.push(promise);
    
    // Advance to next month
    monthDate.setMonth(monthDate.getMonth() + 1);
  }
  
  const monthResults = await Promise.all(monthPromises);
  
  // Calculate month-over-month percent changes using shared utility
  const monthsWithPercentChange = monthResults.map((month, index, array) => {
    if (index === 0) {
      return { ...month, percentChange: 0 };
    }
    
    const prevCount = array[index - 1].count;
    const percentChange = calculatePercentageChange(month.count, prevCount);
    
    return { ...month, percentChange };
  });
  
  return monthsWithPercentChange;
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