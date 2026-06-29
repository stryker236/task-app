export interface Tag {
  id: string;
  name: string;
  usageCount?: number;
  activeUsageCount?: number;
  taskCount?: number;
  activeTaskCount?: number;
  isDisabled?: boolean;
}
