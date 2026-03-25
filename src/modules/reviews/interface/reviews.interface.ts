export interface ReviewsResponse {
  ratingList: {
    id: string;
    user: string;
    avatar: string;
    rating: number;
    date: string;
    variant: string;
    content: string;
    images: string[];
    helpful: number;
  }[];

  ratingStats: {
    summaryRating: number;
    totalReviews: number;
    totalRating: number;
    satisfaction: number;
    stars: [{ star: number; count: number; percent: number }];
  };

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
