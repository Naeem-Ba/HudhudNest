export interface LocationSuggestion {
  id: string;
  type: 'District' | 'Neighborhood';
  parentId: number;
  parentName: string;
  name: string;
  submittedByUserId: string;
  submittedByUserName?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  createdAt: string;
}
