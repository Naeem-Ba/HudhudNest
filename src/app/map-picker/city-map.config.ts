export interface CityMapConfig {
  id: number;
  nameKey: string;
  lat: number;
  lng: number;
  zoom: number;
}

export const CITY_MAPS: CityMapConfig[] = [
   {
    id: 0,
    nameKey: 'DAMASCUS',      // دمشق
    lat: 33.5138,
    lng: 36.2765,
    zoom: 13
  },
  {
    id: 1,
    nameKey: 'ALEPPO',        // حلب
    lat: 36.2021,
    lng: 37.1343,
    zoom: 13
  },
  {
    id: 2,
    nameKey: 'HOMS',          // حمص
    lat: 34.7324,
    lng: 36.7137,
    zoom: 13
  },
  {
    id: 3,
    nameKey: 'LATTAKIA',      // اللاذقية
    lat: 35.5306,
    lng: 35.7900,
    zoom: 13
  },
  {
    id: 4,
    nameKey: 'HAMA',          // حماة
    lat: 35.1318,
    lng: 36.7578,
    zoom: 13
  },  
  {
    id: 5,
    nameKey: 'DEIR_EZZOR',    // دير الزور
    lat: 35.3359,
    lng: 40.1408,
    zoom: 13
  },
  {
    id: 6,
    nameKey: 'RAQQA',         // الرقة
    lat: 35.9506,
    lng: 39.0079,
    zoom: 13
  },
  {
    id: 7,
    nameKey: 'IDLIB',         // إدلب
    lat: 35.9306,
    lng: 36.6339,
    zoom: 13
  },
  {
    id: 8,
    nameKey: 'HASAKAH',       // الحسكة
    lat: 36.507867,
    lng: 40.7462671,
    zoom: 13
  },
  {
    id: 9,
    nameKey: 'QAMISHLI',         // القامشلي
    lat: 37.05,
    lng: 41.22,
    zoom: 13
  },
  {
    id: 10,
    nameKey: 'DARAA',         // درعا
    lat: 32.6250,
    lng: 36.1069,
    zoom: 13
  },
  {
    id: 11,
    nameKey: 'SUWAYDA',       // السويداء
    lat: 32.7089,
    lng: 36.5695,
    zoom: 13
  },
  {
    id: 12,
    nameKey: 'QUNEITRA',      // القنيطرة
    lat: 33.1256,
    lng: 35.8246,
    zoom: 12
  },
  {
    id: 13,
    nameKey: 'TARTUS',        // طرطوس
    lat: 34.8890,
    lng: 35.8866,
    zoom: 13
  },
  {
    id: 14,
    nameKey: 'RIF_DIMASHQ',   // ريف دمشق
    lat: 33.5167,
    lng: 36.3000,
    zoom: 11
  } 
  
];