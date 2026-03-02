export interface Notification {
  id: string;
  type: string;
  recipient: string;
  payload: Record<string, unknown>;
  status: string;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
