export interface Favorite {
  id?: string;
  propertyId: string;
  userId?: string;
  createdAt?: string;
  property?: import('./property.model').Property;
}
