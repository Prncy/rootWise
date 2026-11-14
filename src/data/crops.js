// Broad screening ranges only. Local varieties and growing systems can differ.
export const CROPS = [
  { name: "Maize", group: "cereal", ph: [5.5, 7.5], temp: [18, 30], rain: [500, 1200], season: "Warm season", note: "Needs reliable moisture during flowering." },
  { name: "Rice", group: "cereal", ph: [5, 7], temp: [20, 32], rain: [1000, 2500], season: "Warm, wet season", note: "Water availability and production system are decisive." },
  { name: "Wheat", group: "cereal", ph: [6, 7.5], temp: [10, 24], rain: [350, 900], season: "Cool season", note: "Heat during grain filling can reduce performance." },
  { name: "Sorghum", group: "cereal", ph: [5.5, 8], temp: [22, 32], rain: [300, 800], season: "Warm season", note: "Often more tolerant of heat and dry spells than maize." },
  { name: "Pearl millet", group: "cereal", ph: [5, 7.5], temp: [24, 34], rain: [200, 600], season: "Warm, dry season", note: "A useful option in lower-rainfall environments." },
  { name: "Soybean", group: "legume", ph: [6, 7.5], temp: [18, 30], rain: [450, 1000], season: "Warm season", note: "Inoculation and suitable drainage can matter." },
  { name: "Groundnut", group: "legume", ph: [5.5, 7], temp: [20, 32], rain: [400, 1000], season: "Warm season", note: "Avoid waterlogging; calcium is important for pod filling." },
  { name: "Common bean", group: "legume", ph: [5.5, 7], temp: [15, 26], rain: [350, 850], season: "Mild to warm season", note: "Sensitive to heat at flowering and waterlogging." },
  { name: "Cowpea", group: "legume", ph: [5, 7.5], temp: [22, 34], rain: [250, 750], season: "Warm, dry season", note: "Often suited to hot conditions and shorter seasons." },
  { name: "Cassava", group: "root", ph: [5, 7], temp: [22, 32], rain: [700, 1500], season: "Warm season", note: "Establishment needs moisture; mature plants tolerate some dry periods." },
  { name: "Potato", group: "root", ph: [5, 6.5], temp: [12, 22], rain: [450, 900], season: "Cool season", note: "Heat and irregular water can reduce tuber quality." },
  { name: "Sweet potato", group: "root", ph: [5, 7], temp: [20, 30], rain: [500, 1200], season: "Warm season", note: "Performs across varied soils but needs a suitable variety." },
  { name: "Sunflower", group: "oilseed", ph: [6, 8], temp: [18, 30], rain: [300, 800], season: "Warm season", note: "Deep roots help, but establishment moisture is important." },
  { name: "Tomato", group: "vegetable", ph: [5.5, 7], temp: [18, 28], rain: [400, 1000], season: "Mild to warm season", note: "Disease pressure, irrigation and market access matter." },
  { name: "Cotton", group: "cash", ph: [5.5, 8], temp: [20, 32], rain: [500, 1200], season: "Warm season", note: "Requires a suitable frost-free growing period." }
];

export const GROUP_LABELS = {
  cereal: "Cereal", legume: "Legume", root: "Root crop",
  oilseed: "Oilseed", vegetable: "Vegetable", cash: "Cash crop"
};