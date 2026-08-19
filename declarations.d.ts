declare module '@mapbox/polyline' {
  export function decode(str: string, precision?: number): [number, number][];
  export function encode(coordinates: [number, number][], precision?: number): string;
  export function fromGeoJSON(geojson: any, precision?: number): string;
  export function toGeoJSON(str: string, precision?: number): any;
  const polyline: {
    decode: typeof decode;
    encode: typeof encode;
    fromGeoJSON: typeof fromGeoJSON;
    toGeoJSON: typeof toGeoJSON;
  };
  export default polyline;
}
