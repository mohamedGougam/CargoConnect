import { chromium } from "playwright";

const browser = await chromium.launch();
const sizes = [
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1366, h: 768 },
];

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
  page.on("pageerror", (err) => console.log(`[pageerror ${size.w}]`, err.message));

  await page.goto("http://localhost:3000", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Click a vessel near Piraeus
  const clicked = await page.evaluate(() => {
    const map = window.__ccMap;
    if (!map) return false;
    const pt = map.project([23.65, 37.94]);
    const feats = map.queryRenderedFeatures(
      [
        [pt.x - 30, pt.y - 30],
        [pt.x + 30, pt.y + 30],
      ],
      {
        layers: ["cc-vessels-dot", "cc-vessels-symbol"].filter((id) => map.getLayer(id)),
      },
    );
    if (!feats.length) return false;
    const id = String(feats[0].properties?.id ?? "");
    // Dispatch via map click at feature point
    map.fire("click", {
      lngLat: { lng: 23.65, lat: 37.94 },
      point: pt,
      originalEvent: { preventDefault() {}, stopPropagation() {} },
    });
    // Also set selection by simulating the app path: click handler uses queryRenderedFeatures
    return Boolean(id);
  });

  // Use UI: click canvas at projected point
  const point = await page.evaluate(() => {
    const map = window.__ccMap;
    const pt = map.project([23.65, 37.94]);
    return { x: pt.x, y: pt.y };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => {
    const drawer = document.querySelector('[role="dialog"]');
    const bodyScroll =
      document.documentElement.scrollWidth > document.documentElement.clientWidth;
    if (!drawer) {
      return { open: false, bodyScroll };
    }
    const rect = drawer.getBoundingClientRect();
    const style = getComputedStyle(drawer);
    const title = drawer.querySelector("h2");
    const titleRect = title?.getBoundingClientRect();
    return {
      open: true,
      bodyScroll,
      drawerWidth: Math.round(rect.width),
      drawerLeft: Math.round(rect.left),
      drawerRight: Math.round(rect.right),
      viewport: window.innerWidth,
      fullyVisible: rect.right <= window.innerWidth + 1 && rect.left >= -1,
      overflowX: style.overflowX,
      titleClipped: title && titleRect ? title.scrollWidth > title.clientWidth + 1 : null,
      hasClose: Boolean(drawer.querySelector('[aria-label="Close details"]')),
      scrollArea: Boolean(document.querySelector(".cc-drawer-scroll")),
    };
  });

  // Escape close
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const closed = await page.evaluate(
    () => !document.documentElement.classList.contains("cc-drawer-open"),
  );

  console.log(
    JSON.stringify({ size, clicked, metrics, closedAfterEsc: closed }, null, 2),
  );
  await page.screenshot({ path: `visual-check-${size.w}.png` });
  await page.close();
}

await browser.close();
