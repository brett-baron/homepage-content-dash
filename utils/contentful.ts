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