import { CollectionProp, EntryProps } from 'contentful-management';
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

// Helper function to fetch all pages of data
async function fetchAllPages<T>(
  fetchPage: (skip: number, limit: number) => Promise<{ items: T[]; total: number }>,
  limit: number = 1000
): Promise<T[]> {
  const firstPage = await fetchPage(0, limit);
  const totalItems = firstPage.total;
  const totalPages = Math.ceil(totalItems / limit);
  
  if (totalPages <= 1) {
    return firstPage.items;
  }

  // Create array of page promises, starting from page 2 (we already have page 1)
  const pagePromises = Array.from({ length: totalPages - 1 }, (_, i) => 
    fetchPage((i + 1) * limit, limit)
  );

  // Fetch all remaining pages in parallel
  const remainingPages = await Promise.all(pagePromises);
  
  // Combine all items
  return [
    ...firstPage.items,
    ...remainingPages.flatMap(page => page.items)
  ];
}

// Update getContentStatsPaginated to use pagination
export const getContentStatsPaginated = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  actions: any[],
  recentlyPublishedDays: number = 7,
  needsUpdateMonths: number = 6,
  trackedContentTypes: string[] = []
): Promise<ContentStats> => {
  const now = new Date();
  
  // Calculate all required dates at once
  const dates = {
    currentMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    previousMonth: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    recentlyPublished: new Date(now.getTime() - recentlyPublishedDays * 24 * 60 * 60 * 1000),
    needsUpdate: new Date(now.getTime() - needsUpdateMonths * 30 * 24 * 60 * 60 * 1000)
  };

  // Build content type filter string for queries
  const contentTypeFilter = trackedContentTypes.length > 0 
    ? `&sys.contentType.sys.id[in]=${trackedContentTypes.join(',')}`
    : '';

  // Create fetch functions for each query
  const fetchTotalPublished = (skip: number, limit: number) => 
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        skip,
        limit
      }
    });

  const fetchMonthlyStats = (skip: number, limit: number) =>
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.firstPublishedAt[gte]': dates.previousMonth.toISOString(),
        'sys.publishedAt[exists]': true,
        skip,
        limit,
        order: 'sys.firstPublishedAt'
      }
    });

  const fetchRecentAndNeedsUpdate = (skip: number, limit: number) =>
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        skip,
        limit,
        order: 'sys.publishedAt'
      }
    });

  // Make parallel API calls for different metrics with pagination
  const [totalPublishedResponse, monthlyStatsItems, recentAndNeedsUpdateItems] = await Promise.all([
    fetchTotalPublished(0, 1), // We only need the total count
    fetchAllPages(fetchMonthlyStats),
    fetchAllPages(fetchRecentAndNeedsUpdate)
  ]);

  // Create a map to store counts by month
  const monthCounts = new Map<string, number>();
  
  // Initialize current and previous month with 0
  const currentMonthKey = `${dates.currentMonth.getFullYear()}-${String(dates.currentMonth.getMonth() + 1).padStart(2, '0')}`;
  const previousMonthKey = `${dates.previousMonth.getFullYear()}-${String(dates.previousMonth.getMonth() + 1).padStart(2, '0')}`;
  monthCounts.set(currentMonthKey, 0);
  monthCounts.set(previousMonthKey, 0);

  // Count entries by month
  (monthlyStatsItems as ContentfulEntry[]).forEach((entry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthCounts.has(monthKey)) {
        monthCounts.set(monthKey, monthCounts.get(monthKey)! + 1);
      }
    }
  });

  const thisMonthPublished = monthCounts.get(currentMonthKey) || 0;
  const previousMonthPublished = monthCounts.get(previousMonthKey) || 0;

  // Calculate percent change
  const percentChange = calculatePercentageChange(thisMonthPublished, previousMonthPublished);

  // Process recent and needs update counts
  const recentlyPublishedCount = (recentAndNeedsUpdateItems as ContentfulEntry[])
    .filter((entry) => {
      const publishDate = new Date(entry.sys.publishedAt!);
      const contentType = entry.sys.contentType?.sys?.id;
      return publishDate >= dates.recentlyPublished &&
             (!trackedContentTypes.length || trackedContentTypes.includes(contentType));
    }).length;

  const needsUpdateCount = (recentAndNeedsUpdateItems as ContentfulEntry[])
    .filter((entry) => {
      const publishDate = new Date(entry.sys.publishedAt!);
      const contentType = entry.sys.contentType?.sys?.id;
      return publishDate <= dates.needsUpdate &&
             (!trackedContentTypes.length || trackedContentTypes.includes(contentType));
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
    totalPublished: totalPublishedResponse.total,
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

// Update fetchChartData to use monthsToShow
export const fetchChartData = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  options: {
    monthsToShow?: number | null;
  } = {}
): Promise<{
  newContent: Array<{ date: string; count: number; percentChange?: number }>;
}> => {
  const { monthsToShow = 12 } = options;
  const now = new Date();
  
  let startDate: Date;
  
  if (monthsToShow === null) {
    // For "All Time", find the earliest entry
    try {
      const earliestEntry = await cma.entry.getMany({
        spaceId,
        environmentId,
        query: {
          'sys.firstPublishedAt[exists]': true,
          'sys.publishedAt[exists]': true,
          limit: 1,
          order: 'sys.firstPublishedAt'
        }
      });
      
      if (earliestEntry.items.length > 0) {
        const earliestDate = new Date(earliestEntry.items[0].sys.firstPublishedAt);
        startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
      } else {
        // Fallback to 12 months ago if no entries found
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 12);
        startDate.setDate(1);
      }
    } catch (error) {
      console.error('Error finding earliest entry:', error);
      // Fallback to 12 months ago
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 12);
      startDate.setDate(1);
    }
  } else {
    // Use the specified number of months
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - monthsToShow);
  startDate.setDate(1);
  }
  
  startDate.setHours(0, 0, 0, 0);  // Set to beginning of the day

  // Create fetch function for pagination
  const fetchNewContent = (skip: number, limit: number) =>
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.firstPublishedAt[gte]': startDate.toISOString(),
        'sys.publishedAt[exists]': true,
        skip,
        limit,
        order: 'sys.firstPublishedAt'
      }
    });

  // Fetch all pages
  const newContentItems = await fetchAllPages(fetchNewContent);

  // Create map to store counts by month
  const newContentCounts: Record<string, number> = {};
  
  // Initialize all months with zero counts
  let currentMonth = new Date(startDate);
  while (currentMonth <= now) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    newContentCounts[monthKey] = 0;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Count new entries by month
  (newContentItems as ContentfulEntry[]).forEach((entry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (newContentCounts[monthKey] !== undefined) {
        newContentCounts[monthKey]++;
      }
    }
  });

  // Process month counts
  const processMonthCounts = (counts: Record<string, number>) => {
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count], index, array) => {
        if (index === 0) {
          return { date, count, percentChange: 0 };
        }
        
        const prevCount = array[index - 1][1];
        const percentChange = calculatePercentageChange(count, prevCount);
        
        return { date, count, percentChange };
      });
  };

  return {
    newContent: processMonthCounts(newContentCounts)
  };
};

// Update calculateAverageTimeToPublish to remove excludedContentTypes
export const calculateAverageTimeToPublish = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  timeToPublishDays: number
) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeToPublishDays);

    // Create fetch function for pagination
    const fetchEntries = (skip: number, limit: number) =>
      cma.entry.getMany({
        spaceId,
        environmentId,
        query: {
          'sys.firstPublishedAt[exists]': true,
          'sys.firstPublishedAt[gte]': cutoffDate.toISOString(),
          skip,
          limit
        }
      });

    // Fetch all pages
    const entries = await fetchAllPages(fetchEntries);

    if (!entries.length) return 0;

    // Process entries
    const timeDiffs = (entries as ContentfulEntry[])
      .filter((entry) => 
        entry.sys.contentType?.sys?.id && 
        entry.sys.createdAt && 
        entry.sys.firstPublishedAt
      )
      .map((entry) => {
        const createdAt = new Date(entry.sys.createdAt).getTime();
        const firstPublishedAt = new Date(entry.sys.firstPublishedAt!).getTime();
        return (firstPublishedAt - createdAt) / (1000 * 60 * 60 * 24);
      });

    if (!timeDiffs.length) return 0;

    const average = timeDiffs.reduce((acc: number, curr: number) => acc + curr, 0) / timeDiffs.length;
    return average;
  } catch (error) {
    console.error('Error calculating average time to publish:', error);
    return 0;
  }
};

// Update fetchContentTypeChartData to use monthsToShow
export const fetchContentTypeChartData = async (
  cma: any,
  spaceId: string,
  environmentId: string,
  options: {
    trackedContentTypes?: string[];
    monthsToShow?: number | null;
  } = {}
): Promise<{
  contentTypeData: Array<{ date: string; [key: string]: string | number }>;
  contentTypes: string[];
}> => {
  const { trackedContentTypes = [], monthsToShow = 12 } = options;

  const now = new Date();
  
  let startDate: Date;
  
  if (monthsToShow === null) {
    // For "All Time", find the earliest entry
    try {
      const earliestEntry = await cma.entry.getMany({
        spaceId,
        environmentId,
        query: {
          'sys.firstPublishedAt[exists]': true,
          'sys.publishedAt[exists]': true,
          limit: 1,
          order: 'sys.firstPublishedAt'
        }
      });
      
      if (earliestEntry.items.length > 0) {
        const earliestDate = new Date(earliestEntry.items[0].sys.firstPublishedAt);
        startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
      } else {
        // Fallback to 12 months ago if no entries found
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 12);
        startDate.setDate(1);
      }
    } catch (error) {
      console.error('Error finding earliest entry:', error);
      // Fallback to 12 months ago
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 12);
      startDate.setDate(1);
    }
  } else {
    // Use the specified number of months
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - monthsToShow);
  startDate.setDate(1);
  }
  
  startDate.setHours(0, 0, 0, 0);

  // Only fetch new content
  const fetchNewContent = (skip: number, limit: number) =>
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.firstPublishedAt[gte]': startDate.toISOString(),
        'sys.publishedAt[exists]': true,
        skip,
        limit,
        order: 'sys.firstPublishedAt'
      }
    });

  // Fetch all pages
  const newContentEntries = await fetchAllPages(fetchNewContent);

  // Create data structure to store monthly counts by content type
  const monthlyData: { [key: string]: { [key: string]: number } } = {};

  // Initialize all months with zero counts
  let currentMonth = new Date(startDate);
  while (currentMonth <= now) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    monthlyData[monthKey] = {};
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Process new content entries
  (newContentEntries as ContentfulEntry[]).forEach((entry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      const contentType = entry.sys.contentType?.sys.id || 'unknown';

      if (monthlyData[monthKey]) {
        if (!monthlyData[monthKey][contentType]) {
          monthlyData[monthKey][contentType] = 0;
        }
        monthlyData[monthKey][contentType]++;
      }
    }
  });

  // Get all content types that have been published
  const allContentTypes = new Set<string>();
  Object.values(monthlyData).forEach(monthData => {
    Object.keys(monthData).forEach(contentType => {
      allContentTypes.add(contentType);
    });
  });

  // Filter content types based on tracked types if provided
  const contentTypes = trackedContentTypes.length > 0 
    ? trackedContentTypes.filter(type => allContentTypes.has(type))
    : Array.from(allContentTypes);

  // Create sorted array of months
  const sortedMonths = Object.keys(monthlyData).sort();

  // Transform data into the required format
  const contentTypeData = sortedMonths.map(month => {
    const monthData: { [key: string]: string | number } = { date: month };
    contentTypes.forEach(contentType => {
      monthData[contentType] = monthlyData[month]?.[contentType] || 0;
    });
    return monthData;
  });

  return {
    contentTypeData: contentTypeData as Array<{ date: string; [key: string]: string | number }>,
    contentTypes: contentTypes
  };
}; 