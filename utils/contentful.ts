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

  // Process monthly stats
  const thisMonthPublished = (monthlyStatsItems as ContentfulEntry[])
    .filter((entry) => {
      const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
      return firstPublishDate >= dates.currentMonth;
    }).length;

  const previousMonthPublished = (monthlyStatsItems as ContentfulEntry[])
    .filter((entry) => {
      const firstPublishDate = new Date(entry.sys.firstPublishedAt!);
      return firstPublishDate >= dates.previousMonth && 
             firstPublishDate < dates.currentMonth;
    }).length;

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

  // Calculate scheduled count from actions (no pagination needed as limited to 500)
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
    monthsToShow?: number;
  } = {}
): Promise<{
  newContent: Array<{ date: string; count: number; percentChange?: number }>;
  updatedContent: Array<{ date: string; count: number; percentChange?: number }>;
}> => {
  const { monthsToShow = 12 } = options;

  // Calculate start of current month and previous month
  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToShow + 1, 1);

  // Create fetch functions for pagination
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

  const fetchAllPublished = (skip: number, limit: number) =>
    cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[gte]': startDate.toISOString(),
        'sys.publishedAt[exists]': true,
        skip,
        limit,
        order: 'sys.publishedAt'
      }
    });

  // Fetch all pages in parallel
  const [newContentItems, allPublishedItems] = await Promise.all([
    fetchAllPages(fetchNewContent),
    fetchAllPages(fetchAllPublished)
  ]);

  // Create maps to store counts by month
  const newContentCounts: Record<string, number> = {};
  const updatedContentCounts: Record<string, number> = {};
  
  // Initialize all months with zero counts
  let currentMonth = new Date(startDate);
  while (currentMonth <= now) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    newContentCounts[monthKey] = 0;
    updatedContentCounts[monthKey] = 0;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Count new entries by month using exact month boundaries
  (newContentItems as ContentfulEntry[]).forEach((entry) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (newContentCounts[monthKey] !== undefined) {
        newContentCounts[monthKey]++;
      }
    }
  });

  // Count all published entries by month using exact month boundaries
  (allPublishedItems as ContentfulEntry[]).forEach((entry) => {
    if (entry.sys.publishedAt) {
      const publishDate = new Date(entry.sys.publishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (updatedContentCounts[monthKey] !== undefined) {
        updatedContentCounts[monthKey]++;
      }
    }
  });

  // Process month counts using the same calculation as the card
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
    newContent: processMonthCounts(newContentCounts),
    updatedContent: processMonthCounts(updatedContentCounts)
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
export async function fetchContentTypeChartData(
  cma: any,
  spaceId: string,
  environmentId: string,
  options: {
    trackedContentTypes: string[];
    monthsToShow?: number;
  }
) {
  try {
    const { trackedContentTypes, monthsToShow = 12 } = options;

    // Calculate start of current month and previous month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToShow + 1, 1);

    // Get all entries with their publish dates
    const publishedEntries = await cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        'limit': 1000,
        'order': 'sys.publishedAt'
      }
    });

    // Get all entries with their update dates
    const updatedEntries = await cma.entry.getMany({
      spaceId,
      environmentId,
      query: {
        'sys.updatedAt[exists]': true,
        'limit': 1000,
        'order': 'sys.updatedAt'
      }
    });

    // Process entries by month for both new and updated content
    const monthlyData: { [key: string]: { [key: string]: number } } = {};
    const monthlyUpdatedData: { [key: string]: { [key: string]: number } } = {};
    const contentTypes = new Set<string>();

    // Initialize all months with zero counts
    let currentMonth = new Date(startDate);
    while (currentMonth <= now) {
      const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
      monthlyData[monthKey] = {};
      monthlyUpdatedData[monthKey] = {};
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // Process published entries - ONLY filter by content type here
    publishedEntries.items.forEach((entry: any) => {
      const contentType = entry.sys.contentType.sys.id;
      // Only process if content type is tracked
      if (trackedContentTypes.length === 0 || trackedContentTypes.includes(contentType)) {
        const date = new Date(entry.sys.firstPublishedAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        
        if (monthlyData[monthKey]) {
          if (!monthlyData[monthKey][contentType]) {
            monthlyData[monthKey][contentType] = 0;
          }
          monthlyData[monthKey][contentType]++;
          contentTypes.add(contentType);
        }
      }
    });

    // Process updated entries - ONLY filter by content type here
    updatedEntries.items.forEach((entry: any) => {
      const contentType = entry.sys.contentType.sys.id;
      // Only process if content type is tracked
      if (trackedContentTypes.length === 0 || trackedContentTypes.includes(contentType)) {
        const date = new Date(entry.sys.publishedAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        
        if (monthlyUpdatedData[monthKey]) {
          if (!monthlyUpdatedData[monthKey][contentType]) {
            monthlyUpdatedData[monthKey][contentType] = 0;
          }
          monthlyUpdatedData[monthKey][contentType]++;
          contentTypes.add(contentType);
        }
      }
    });

    // Convert to array format
    const sortedMonths = Object.keys(monthlyData).sort();
    const contentTypeArray = Array.from(contentTypes);

    const contentTypeData = sortedMonths.map(month => {
      const monthData: { [key: string]: string | number } = { date: month };
      contentTypeArray.forEach(contentType => {
        monthData[contentType] = monthlyData[month]?.[contentType] || 0;
      });
      return monthData;
    });

    const contentTypeUpdatedData = sortedMonths.map(month => {
      const monthData: { [key: string]: string | number } = { date: month };
      contentTypeArray.forEach(contentType => {
        monthData[contentType] = monthlyUpdatedData[month]?.[contentType] || 0;
      });
      return monthData;
    });

    return {
      contentTypeData: contentTypeData as Array<{ date: string; [key: string]: string | number }>,
      contentTypeUpdatedData: contentTypeUpdatedData as Array<{ date: string; [key: string]: string | number }>,
      contentTypes: contentTypeArray
    };
  } catch (error) {
    console.error('Error fetching content type chart data:', error);
    return {
      contentTypeData: [],
      contentTypeUpdatedData: [],
      contentTypes: []
    };
  }
} 