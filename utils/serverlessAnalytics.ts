import { HomeAppSDK } from '@contentful/app-sdk';

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

interface ChartDataResponse {
  newContent: Array<{ date: string; count: number }>;
  updatedContent: Array<{ date: string; count: number }>;
}

interface AuthorDataResponse {
  authorData: Array<{ date: string; [key: string]: string | number }>;
  authorUpdatedData: Array<{ date: string; [key: string]: string | number }>;
  authors: string[];
}

interface ContentTypeDataResponse {
  contentTypeData: Array<{ date: string; [key: string]: string | number }>;
  contentTypeUpdatedData: Array<{ date: string; [key: string]: string | number }>;
  contentTypes: string[];
}

export class ServerlessAnalyticsService {
  private sdk: HomeAppSDK;
  private functionId = 'contentAnalytics';

  constructor(sdk: HomeAppSDK) {
    this.sdk = sdk;
  }

  async getContentStats(params: {
    trackedContentTypes?: string[];
    needsUpdateMonths?: number;
    recentlyPublishedDays?: number;
    timeToPublishDays?: number;
  }): Promise<ContentStats> {
    const request: AnalyticsRequest = {
      type: 'stats',
      ...params
    };

    try {
      const result = await this.callFunction(request);
      return result as ContentStats;
    } catch (error) {
      console.error('Failed to get content stats:', error);
      throw new Error('Failed to load content statistics');
    }
  }

  async getChartData(params: {
    timeRange?: 'all' | 'year' | '6months';
    trackedContentTypes?: string[];
  }): Promise<ChartDataResponse> {
    const request: AnalyticsRequest = {
      type: 'chartData',
      ...params
    };

    try {
      const result = await this.callFunction(request);
      return result as ChartDataResponse;
    } catch (error) {
      console.error('Failed to get chart data:', error);
      throw new Error('Failed to load chart data');
    }
  }

  async getAuthorData(params: {
    timeRange?: 'all' | 'year' | '6months';
  }): Promise<AuthorDataResponse> {
    const request: AnalyticsRequest = {
      type: 'authorData',
      ...params
    };

    try {
      const result = await this.callFunction(request);
      return result as AuthorDataResponse;
    } catch (error) {
      console.error('Failed to get author data:', error);
      throw new Error('Failed to load author data');
    }
  }

  async getContentTypeData(params: {
    timeRange?: 'all' | 'year' | '6months';
    trackedContentTypes?: string[];
  }): Promise<ContentTypeDataResponse> {
    const request: AnalyticsRequest = {
      type: 'contentTypeData',
      ...params
    };

    try {
      const result = await this.callFunction(request);
      return result as ContentTypeDataResponse;
    } catch (error) {
      console.error('Failed to get content type data:', error);
      throw new Error('Failed to load content type data');
    }
  }

  private async callFunction(request: AnalyticsRequest): Promise<any> {
    try {
      // Use the App SDK to call the serverless function
      const response = await this.sdk.cma.appAction.call({
        appDefinitionId: this.sdk.ids.app || '',
        appActionId: this.functionId,
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.error) {
        throw new Error(response.message || 'Function execution failed');
      }

      return response;
    } catch (error) {
      console.error('Function call failed:', error);
      throw error;
    }
  }

  // Batch multiple requests for efficiency
  async getBatchAnalytics(params: {
    timeRange?: 'all' | 'year' | '6months';
    trackedContentTypes?: string[];
    needsUpdateMonths?: number;
    recentlyPublishedDays?: number;
    timeToPublishDays?: number;
  }): Promise<{
    stats: ContentStats;
    chartData: ChartDataResponse;
    authorData: AuthorDataResponse;
    contentTypeData: ContentTypeDataResponse;
  }> {
    // Execute all analytics requests in parallel
    const [stats, chartData, authorData, contentTypeData] = await Promise.all([
      this.getContentStats(params),
      this.getChartData(params),
      this.getAuthorData(params),
      this.getContentTypeData(params)
    ]);

    return {
      stats,
      chartData,
      authorData,
      contentTypeData
    };
  }
}

// Caching layer for client-side performance
export class CachedAnalyticsService {
  private service: ServerlessAnalyticsService;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(sdk: HomeAppSDK) {
    this.service = new ServerlessAnalyticsService(sdk);
  }

  async getContentStats(params: Parameters<ServerlessAnalyticsService['getContentStats']>[0]): Promise<ContentStats> {
    const cacheKey = `stats-${JSON.stringify(params)}`;
    return this.getCachedOrFetch(cacheKey, () => this.service.getContentStats(params));
  }

  async getChartData(params: Parameters<ServerlessAnalyticsService['getChartData']>[0]): Promise<ChartDataResponse> {
    const cacheKey = `chartData-${JSON.stringify(params)}`;
    return this.getCachedOrFetch(cacheKey, () => this.service.getChartData(params));
  }

  async getBatchAnalytics(params: Parameters<ServerlessAnalyticsService['getBatchAnalytics']>[0]) {
    const cacheKey = `batch-${JSON.stringify(params)}`;
    return this.getCachedOrFetch(cacheKey, () => this.service.getBatchAnalytics(params));
  }

  private async getCachedOrFetch<T>(cacheKey: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.cacheDuration) {
      return cached.data as T;
    }

    try {
      const data = await fetchFn();
      this.cache.set(cacheKey, { data, timestamp: now });
      return data;
    } catch (error) {
      // If we have stale cached data and the request fails, return the stale data
      if (cached) {
        console.warn('Using stale cached data due to fetch error:', error);
        return cached.data as T;
      }
      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
} 