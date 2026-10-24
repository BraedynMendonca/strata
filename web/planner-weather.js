(function attachStrataWeather(global) {
  'use strict';

  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

  function makeQueryUrl(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('A valid campus latitude is required.');
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('A valid campus longitude is required.');
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), daily: 'temperature_2m_max',
      temperature_unit: 'fahrenheit', forecast_days: '7', timezone: 'auto'
    });
    return `${ENDPOINT}?${params}`;
  }

  function normalizeWeather(data) {
    const dates = data?.daily?.time;
    const highs = data?.daily?.temperature_2m_max;
    if (!Array.isArray(dates) || dates.length !== 7 || !Array.isArray(highs) || highs.length !== dates.length) {
      throw new Error('The weather service did not return a complete seven-day forecast.');
    }
    const forecastDates = dates.map((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        throw new Error('The weather service returned an invalid forecast date.');
      }
      return String(date);
    });
    const temperatures = highs.map((value) => {
      if (value === null) return null;
      const temperature = Number(value);
      if (!Number.isFinite(temperature) || temperature < -100 || temperature > 150) {
        throw new Error('The weather service returned an invalid forecast temperature.');
      }
      return temperature;
    });
    return {
      dates: forecastDates,
      highs: temperatures,
      timezone: typeof data.timezone === 'string' && data.timezone ? data.timezone : 'UTC',
      latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
      longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null
    };
  }

  async function fetchWeather(latitude, longitude, fetchImpl = global.fetch) {
    const response = await fetchImpl(makeQueryUrl(latitude, longitude), {
      headers: {Accept: 'application/json'}, cache: 'no-store'
    });
    if (!response.ok) throw new Error(`The weather service returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data?.error) throw new Error(data.reason || 'The weather service could not complete the request.');
    return normalizeWeather(data);
  }

  const api = {makeQueryUrl, normalizeWeather, fetchWeather};
  global.StrataWeather = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
