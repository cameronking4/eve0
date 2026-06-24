import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mapstools.googleapis.com/mcp",
  description:
    "Google Maps Grounding Lite: ground responses in trusted geospatial data. Tools: search_places (places + AI summaries, Place IDs, coordinates, Maps links), lookup_weather (current/hourly/daily forecasts), compute_routes (driving/walking distance and duration).",
  headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY! },
});
