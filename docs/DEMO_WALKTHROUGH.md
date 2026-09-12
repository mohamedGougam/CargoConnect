# CargoConnect Demo Walkthrough

**Audience:** customers, maritime professionals, partners, investors  
**Duration:** ~5–7 minutes  
**Flagship:** Rotterdam → Alexandria · 2,000 MT steel  
**Mode:** Demo V1 (memory persistence, simulated email, AIS development, malware bypass)

Do **not** claim live freight prices, confirmed vessel availability, licensed AIS, or production-grade malware scanning.

Operator setup (`DEMO_MODE=true`):

1. Open map → Operator → **Open flagship search** (or type the query)
2. After RFQ simulate → Operator on request → **Load demo broker responses**
3. Optional: tracking AIS observation fixtures (Operator / DEMO_MODE only)

---

## 0:00–1:00 — Maritime discovery

**Click:** Map home · search  
`2,000 MT steel from Rotterdam to Alexandria`

**Say:**  
“CargoConnect starts with maritime intelligence — ask in natural language and the map frames the corridor.”

**Value:** AI search + live map, not a form wizard.

**Do not claim:** Vessels are commercially available.

---

## 1:00–2:00 — Route, vessels, price request

**Click:** Highlighted corridor-relevant vessel · **Check Current Price** · **Request Up-to-Date Quote**

**Say:**  
“Relevance is corridor and AIS-based. Price intelligence shows what we know — and what needs a broker quote.”

**Value:** Context carries into commercial flow.

**Do not claim:** Live freight rate.

---

## 2:00–3:00 — Quotes & comparison

**Click:** Simulate Request → Load demo broker responses → **Compare Quotes**

**Say:**  
“Three broker responses land in the same workflow. Comparison ranks without inventing FX or missing terms.”

**Value:** Structured commercial decision support.

**Do not claim:** EUR and USD are ranked against each other as equal.

---

## 3:00–4:00 — Proceed, booking, documents

**Click:** Select quote → **Proceed with this quote** → (demo confirmation path) → booking · Manage Documents

**Say:**  
“Proceed is a request — not a booking. Once commercially confirmed, documents and operational readiness follow.”

**Value:** One spine from quote to booking prep.

**Do not claim:** Email was delivered externally when status is DELIVERY_SIMULATED.

---

## 4:00–5:00 — Shipment tracking

**Click:** Operational Handoff (if ready) · Track Shipment · map + milestones

**Say:**  
“AIS is observational. Operational milestones are confirmed separately — CargoConnect keeps that distinction visible.”

**Value:** Intelligence + execution in one place.

**Do not claim:** AIS equals confirmed loaded/departed/arrived.

---

## 5:00–6:00 — Operational exception

**Click:** Attention / ETA exception · review evidence

**Say:**  
“We surface an observed arrival difference with evidence — not a carrier liability verdict.”

**Value:** Exception awareness with audit trail.

**Do not claim:** Claimable delay or carrier fault.

---

## 6:00–7:00 — Claim evidence package

**Click:** **Prepare Claim Evidence** · review dossier · PDF

**Say:**  
“CargoConnect organizes the evidence package — timing, sources, missing items — without deciding liability.”

**Value:** Maritime intelligence → commercial → ops → evidence.

**Do not claim:** Valid claim, compensation due, or insurer submission.

---

## Reset between rehearsals

- Operator → **Reset demo** (requires `DEMO_MODE` + reset secret in sessionStorage), **or** restart the Node process (memory clears).
- Never reset when Postgres is configured.

## Screenshot checklist

1. Maritime AI map  
2. Rotterdam → Alexandria search summary  
3. Quote comparison  
4. Booking overview  
5. Shipment tracking  
6. Operational exception  
7. Claim evidence preparation  

Keep malware / AIS / simulated-email labels subtle but honest.
