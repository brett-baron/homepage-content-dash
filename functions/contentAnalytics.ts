import {
  FunctionEventHandler,
  FunctionTypeEnum,
} from '@contentful/node-apps-toolkit';

interface AnalyticsRequest {
  type: 'stats' | 'chartData' | 'authorData' | 'contentTypeData';
  timeRange?: 'all' | 'year' | '6months';
  trackedContentTypes?: string[];
  needsUpdateMonths?: number;
  recentlyPublishedDays?: number;
  timeToPublishDays?: number;
}

interface ContentStats {
  totalPublished: number;
  percentChange: number;
  scheduledCount: number;
  recentlyPublishedCount: number;
  needsUpdateCount: number;
  previousMonthPublished: number;
  averageTimeToPublish: number;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context
) => {
  const { body } = event;
  const request: AnalyticsRequest = JSON.parse(body);
  
  // Initialize CMA client with provided context
  const cma = require('contentful-management').createClient(
    context.cmaClientOptions,
    {
      defaults: {
        spaceId: context.spaceId,
        environmentId: context.environmentId,
      },
      type: 'plain',
    }
  );

  try {
    switch (request.type) {
      case 'stats':
        return await generateContentStats(cma, context, request);
      case 'chartData':
        return await generateChartData(cma, context, request);
      case 'authorData':
        return await generateAuthorData(cma, context, request);
      case 'contentTypeData':
        return await generateContentTypeData(cma, context, request);
      default:
        throw new Error('Invalid request type');
    }
  } catch (error) {
    console.error('Content analytics function error:', error);
    return {
      error: 'Failed to generate analytics',
      message: error.message
    };
  }
};

async function generateContentStats(cma: any, context: any, request: AnalyticsRequest): Promise<ContentStats> {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  // Use aggregation queries instead of fetching all data
  const [
    totalPublishedResponse,
    currentMonthResponse,
    previousMonthResponse,
    recentlyPublishedResponse,
    needsUpdateResponse,
    scheduledActionsResponse
  ] = await Promise.all([
    // Get total count only - no items
    cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    }),
    // Current month published count
    cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.firstPublishedAt[gte]': currentMonth.toISOString(),
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    }),
    // Previous month published count
    cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.firstPublishedAt[gte]': previousMonth.toISOString(),
        'sys.firstPublishedAt[lt]': currentMonth.toISOString(),
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    }),
    // Recently published count
    cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.publishedAt[gte]': new Date(Date.now() - (request.recentlyPublishedDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
        limit: 1
      }
    }),
    // Needs update count
    cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.publishedAt[exists]': true,
        'sys.updatedAt[lte]': new Date(Date.now() - (request.needsUpdateMonths || 6) * 30 * 24 * 60 * 60 * 1000).toISOString(),
        limit: 1
      }
    }),
    // Scheduled actions
    cma.scheduledActions.getMany({
      spaceId: context.spaceId,
      query: {
        'environment.sys.id': context.environmentId,
        'sys.status[in]': 'scheduled',
        limit: 100
      }
    })
  ]);

  // Calculate scheduled count from actions
  const scheduledCount = scheduledActionsResponse.items.filter((action: any) => 
    action.sys.status === 'scheduled' && 
    new Date(action.scheduledFor.datetime) > now &&
    action.action === 'publish'
  ).length;

  // Calculate average time to publish with sampling
  const averageTimeToPublish = await calculateAverageTimeToPublishOptimized(
    cma, 
    context, 
    request.timeToPublishDays || 30
  );

  const thisMonthPublished = currentMonthResponse.total;
  const previousMonthPublished = previousMonthResponse.total;
  const percentChange = previousMonthPublished > 0 
    ? ((thisMonthPublished - previousMonthPublished) / previousMonthPublished) * 100 
    : 0;

  return {
    totalPublished: totalPublishedResponse.total,
    percentChange,
    scheduledCount,
    recentlyPublishedCount: recentlyPublishedResponse.total,
    needsUpdateCount: needsUpdateResponse.total,
    previousMonthPublished,
    averageTimeToPublish
  };
}

async function generateChartData(cma: any, context: any, request: AnalyticsRequest) {
  const monthsToShow = request.timeRange === 'all' ? 24 : 
                     request.timeRange === '6months' ? 6 : 12;
  
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(now.getMonth() - monthsToShow);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  // Use sampling for large datasets - fetch every 10th entry
  const sampleResponse = await cma.entry.getMany({
    spaceId: context.spaceId,
    environmentId: context.environmentId,
    query: {
      'sys.firstPublishedAt[gte]': startDate.toISOString(),
      'sys.publishedAt[exists]': true,
      limit: 1000, // Limit to reasonable sample size
      order: 'sys.firstPublishedAt'
    }
  });

  // Process sampled data and extrapolate
  const monthlyData: Record<string, number> = {};
  const totalEntries = sampleResponse.total;
  const sampleSize = sampleResponse.items.length;
  const scalingFactor = totalEntries > sampleSize ? totalEntries / sampleSize : 1;

  // Initialize months with zero
  let currentMonth = new Date(startDate);
  while (currentMonth <= now) {
    const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
    monthlyData[monthKey] = 0;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  // Process sample and scale up
  sampleResponse.items.forEach((entry: any) => {
    if (entry.sys.firstPublishedAt) {
      const publishDate = new Date(entry.sys.firstPublishedAt);
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}-01`;
      if (monthlyData[monthKey] !== undefined) {
        monthlyData[monthKey] += scalingFactor;
      }
    }
  });

  // Convert to chart format
  const chartData = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count: Math.round(count) }));

  return { newContent: chartData, updatedContent: chartData };
}

async function generateAuthorData(cma: any, context: any, request: AnalyticsRequest) {
  // Implement optimized author data generation with sampling
  // Similar approach to chart data but grouped by author
  const monthsToShow = request.timeRange === 'all' ? 24 : 
                     request.timeRange === '6months' ? 6 : 12;
  
  // Use a sample of entries to determine top authors
  const sampleResponse = await cma.entry.getMany({
    spaceId: context.spaceId,
    environmentId: context.environmentId,
    query: {
      'sys.publishedAt[exists]': true,
      limit: 1000,
      order: '-sys.publishedAt'
    }
  });

  // Get unique authors from sample
  const authorCounts: Record<string, number> = {};
  sampleResponse.items.forEach((entry: any) => {
    const authorId = entry.sys.createdBy?.sys.id || 'Unknown';
    authorCounts[authorId] = (authorCounts[authorId] || 0) + 1;
  });

  // Get top 10 authors
  const topAuthors = Object.entries(authorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([authorId]) => authorId);

  return {
    authorData: [],
    authorUpdatedData: [],
    authors: topAuthors
  };
}

async function generateContentTypeData(cma: any, context: any, request: AnalyticsRequest) {
  // Implement optimized content type data generation
  const trackedTypes = request.trackedContentTypes || [];
  
  if (trackedTypes.length === 0) {
    return {
      contentTypeData: [],
      contentTypeUpdatedData: [],
      contentTypes: []
    };
  }

  // Use aggregation for each content type
  const contentTypePromises = trackedTypes.map(async (contentTypeId) => {
    const response = await cma.entry.getMany({
      spaceId: context.spaceId,
      environmentId: context.environmentId,
      query: {
        'sys.contentType.sys.id': contentTypeId,
        'sys.publishedAt[exists]': true,
        limit: 1
      }
    });
    return { contentTypeId, count: response.total };
  });

  const results = await Promise.all(contentTypePromises);
  
  return {
    contentTypeData: results.map(r => ({ 
      date: new Date().toISOString().slice(0, 7) + '-01',
      [r.contentTypeId]: r.count 
    })),
    contentTypeUpdatedData: [],
    contentTypes: trackedTypes
  };
}

async function calculateAverageTimeToPublishOptimized(
  cma: any, 
  context: any, 
  timeToPublishDays: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeToPublishDays);

  // Sample only recent entries for time calculation
  const sampleResponse = await cma.entry.getMany({
    spaceId: context.spaceId,
    environmentId: context.environmentId,
    query: {
      'sys.firstPublishedAt[exists]': true,
      'sys.firstPublishedAt[gte]': cutoffDate.toISOString(),
      limit: 100 // Small sample for calculation
    }
  });

  if (sampleResponse.items.length === 0) return 0;

  const timeDiffs = sampleResponse.items
    .filter((entry: any) => entry.sys.createdAt && entry.sys.firstPublishedAt)
    .map((entry: any) => {
      const createdAt = new Date(entry.sys.createdAt).getTime();
      const firstPublishedAt = new Date(entry.sys.firstPublishedAt).getTime();
      return (firstPublishedAt - createdAt) / (1000 * 60 * 60 * 24);
    });

  if (timeDiffs.length === 0) return 0;

  return timeDiffs.reduce((acc, curr) => acc + curr, 0) / timeDiffs.length;
} 