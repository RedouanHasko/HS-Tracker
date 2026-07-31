"""Create an idempotent rental import package from the two reviewed legacy workbooks.

The settlement workbook is treated as authoritative for 2026 financial records.
Calendar-only records retain confidence/provenance notes instead of inventing
commission, owner, or payment information.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path


OUTPUT = Path("migration-output/legacy-rentals-2023-2026.json")


def booking(
    source_id: str,
    guest: str,
    check_in: str,
    check_out: str,
    rate: float = 0,
    commission_rate: float | None = None,
    cleaning: float = 0,
    paid: float = 0,
    notes: str = "",
):
    nights = (date.fromisoformat(check_out) - date.fromisoformat(check_in)).days
    total = round(nights * rate, 2) if rate else 0
    commission = round(total * commission_rate / 100, 2) if commission_rate is not None else 0
    return {
        "id": source_id.replace(":", "_"),
        "legacySourceId": source_id,
        "clientName": guest,
        "clientPhone": "",
        "source": "Legacy workbook",
        "numberOfGuests": 1,
        "checkIn": check_in,
        "checkOut": check_out,
        "totalNights": nights,
        "nightlyRate": rate,
        "totalAmount": total,
        **({"commissionRate": commission_rate} if commission_rate is not None else {}),
        "commission": commission,
        "cleaningFee": cleaning,
        "cleaningChargeTo": "owner",
        "ownerPayout": round(total - commission - cleaning, 2),
        "status": "completed",
        "notes": notes,
        "paidAmount": min(total, paid),
        "balanceDue": max(0, round(total - paid, 2)),
    }


def expense(source_id: str, title: str, amount: float, when: str, booking_id: str = "", notes: str = ""):
    return {
        "id": source_id.replace(":", "_"),
        "legacySourceId": source_id,
        "title": title,
        "description": notes or "Imported from HS service 2024.xlsx",
        "amount": round(amount, 2),
        "currency": "DH",
        "category": "cleaning" if "clean" in title.lower() or "nettoyage" in title.lower() else "maintenance",
        "date": when,
        "paidBy": "legacy-import",
        "supplier": "Legacy record",
        "receipts": [],
        "rentalChargeTo": "owner",
        **({"rentalBookingId": booking_id.replace(":", "_")} if booking_id else {}),
    }


projects = {
    "D4/3.4": {"ownerName": "Soulayman", "rate": 1200, "bookings": [], "expenses": [], "payments": []},
    "D3/3.2": {"ownerName": "Chettouf Karim", "rate": 1500, "bookings": [], "expenses": [], "payments": []},
    "B6/1.4": {"ownerName": "Rafifi", "rate": 1600, "bookings": [], "expenses": [], "payments": []},
    "D1/2.3": {"ownerName": "Majdouline", "rate": 1300, "bookings": [], "expenses": [], "payments": []},
    "D3/2.1": {"ownerName": "Sanaa", "rate": 1400, "bookings": [], "expenses": [], "payments": []},
    "D4/2.3": {"ownerName": "Sanaa", "rate": 1575, "bookings": [], "expenses": [], "payments": []},
}


def add_booking(code: str, *args, **kwargs):
    item = booking(*args, **kwargs)
    projects[code]["bookings"].append(item)
    return item["legacySourceId"]


def add_expense(code: str, *args, **kwargs):
    projects[code]["expenses"].append(expense(*args, **kwargs))


d434_1 = add_booking("D4/3.4", "hs-service:D4-3.4:2026-07-20", "CLIENT SOULAYMAN", "2026-07-20", "2026-08-01", 1200, 10, 200)
d434_2 = add_booking("D4/3.4", "hs-service:D4-3.4:2026-08-04", "CLIENT SOULAYMAN", "2026-08-04", "2026-08-11", 1200, 10)
d434_3 = add_booking("D4/3.4", "hs-service:D4-3.4:2026-08-12", "IKRAM", "2026-08-12", "2026-08-16", 1200, 20)
add_expense("D4/3.4", "hs-service:D4-3.4:orange", "Orange", 300, "2026-07-20", d434_1)
add_expense("D4/3.4", "hs-service:D4-3.4:their", "Their", 80, "2026-08-04", d434_2)
for suffix, title, amount in [
    ("linen", "Draps et serviettes", 680), ("rack", "Etendoir a linge", 200),
    ("electric", "Electricite", 100), ("lamp", "Lampe", 20), ("cleaning", "Produits nettoyage", 60),
]:
    add_expense("D4/3.4", f"hs-service:D4-3.4:{suffix}", title, amount, "2026-08-12", d434_3)

d332_1 = add_booking("D3/3.2", "hs-service:D3-3.2:2026-07-13", "SAFAE HILALI", "2026-07-13", "2026-08-05", 1400, 20, 200)
d332_2 = add_booking("D3/3.2", "hs-service:D3-3.2:2026-08-09", "RABAB", "2026-08-09", "2026-08-24", 1500, 20, 200, 11819.52)
add_expense("D3/3.2", "hs-service:D3-3.2:wifi", "Orange WiFi", 300, "2026-07-13", d332_1)
add_expense("D3/3.2", "hs-service:D3-3.2:carpenter", "Menuisier", 100, "2026-08-09", d332_2)
add_expense("D3/3.2", "hs-service:D3-3.2:cleaning-products", "Produits nettoyage", 150, "2026-08-31", notes="Service row had no stay dates.")
add_expense("D3/3.2", "hs-service:D3-3.2:electricity", "Electricite", 300, "2026-08-31", notes="Service row had no linked booking.")

b614_1 = add_booking("B6/1.4", "hs-service:B6-1.4:2026-07-22", "Wafae cousine", "2026-07-22", "2026-07-27", 1600, 20, 200, 1600)
add_expense("B6/1.4", "hs-service:B6-1.4:wifi", "Inwi WiFi", 200, "2026-07-22", b614_1)
add_expense("B6/1.4", "hs-service:B6-1.4:cleaning-products", "Produits nettoyage", 90, "2026-08-31", notes="Service row had no stay dates.")

d123_1 = add_booking("D1/2.3", "hs-service:D1-2.3:2026-07-14", "ABDELAZIZ", "2026-07-14", "2026-07-17", 1400, 20, 200)
d123_2 = add_booking("D1/2.3", "hs-service:D1-2.3:2026-07-20", "NAJAT AZIZ", "2026-07-20", "2026-07-26", 1300, 20, 150)
d123_3 = add_booking("D1/2.3", "hs-service:D1-2.3:2026-08-12", "COUSINE KHALIL", "2026-08-12", "2026-08-22", 1300, 20, 150)
add_expense("D1/2.3", "hs-service:D1-2.3:wifi", "Orange WiFi", 300, "2026-07-14", d123_1)
add_expense("D1/2.3", "hs-service:D1-2.3:fridge-gas", "Gaz refrigerateur", 250, "2026-07-20", d123_2)
add_expense("D1/2.3", "hs-service:D1-2.3:annual-charges", "Charges exercice 2025/2026", 3374.46, "2026-08-12", d123_3)
add_expense("D1/2.3", "hs-service:D1-2.3:cleaning-products", "Produits nettoyage", 100, "2026-08-31")
add_expense("D1/2.3", "hs-service:D1-2.3:plumber", "Plombier chauffe-eau", 100, "2026-08-31")
for index, amount in enumerate((3000, 6842, 1000), start=1):
    projects["D1/2.3"]["payments"].append({
        "id": f"hs-service_D1-2.3_owner-payment-{index}",
        "legacySourceId": f"hs-service:D1-2.3:owner-payment-{index}",
        "date": "2026-08-31",
        "period": "2026-08",
        "amount": amount,
        "method": "bank_transfer",
        "notes": "Virement Majdouline; exact transfer date was not recorded in the workbook.",
    })

d321_1 = add_booking("D3/2.1", "hs-service:D3-2.1:2026-08-19", "Legacy guest", "2026-08-19", "2026-08-24", 1400, 20, 200, notes="Guest name was not recorded in the settlement sheet.")
add_expense("D3/2.1", "hs-service:D3-2.1:wifi", "WiFi", 270, "2026-08-19", d321_1)
add_expense("D3/2.1", "hs-service:D3-2.1:curtain", "Reparation rideau", 200, "2026-08-19", d321_1)

d423_1 = add_booking("D4/2.3", "hs-service:D4-2.3:2026-08-07", "Legacy guest", "2026-08-07", "2026-08-20", 1160.25, 10, 100, notes="Workbook records 14 nights, while 07/08 to 20/08 spans 13 nights. Financial totals preserve the recorded 14 nights. 110.5 EUR/night converted at 10.5 DH/EUR.",)
for item in projects["D4/2.3"]["bookings"]:
    if item["legacySourceId"] == d423_1:
        item["totalNights"] = 14
        item["totalAmount"] = 16243.5
        item["commission"] = 1624.35
        item["ownerPayout"] = 14519.15
d423_2 = add_booking("D4/2.3", "hs-service:D4-2.3:2026-08-24", "Legacy guest", "2026-08-24", "2026-08-27", 1575, 20, 100, 4725)
d423_3 = add_booking("D4/2.3", "hs-service:D4-2.3:2026-08-27", "Legacy guest", "2026-08-27", "2026-08-28", 5040, 10, 100, notes="The workbook records a 5,040 DH total (480 EUR at 10.5) from 27/08 but does not provide nights or checkout. A one-day placeholder preserves the amount and requires review.")
add_expense("D4/2.3", "hs-service:D4-2.3:iron", "Fer a repasser et table", 418.95, "2026-08-07", d423_1)
add_expense("D4/2.3", "hs-service:D4-2.3:dryer", "Seche-linge", 379, "2026-08-24", d423_2)
add_expense("D4/2.3", "hs-service:D4-2.3:curtain", "Rideau", 170, "2026-08-27", d423_3)


historical_calendar = [
    # Corrected August 2023 block is used; the earlier duplicate block is intentionally excluded.
    ("D3/2.4", "MHAOUICHI", "2023-08-01", "2023-08-14", "calendar:2023:aug:corrected"),
    ("D3/2.4", "benchaba m", "2023-08-18", "2023-08-21", "calendar:2023:aug:corrected"),
    ("D4/2.3", "UNESS ALMALKI", "2023-08-01", "2023-08-12", "calendar:2023:aug:corrected"),
    ("D4/2.3", "jihane maskaoui", "2023-08-19", "2023-08-21", "calendar:2023:aug:corrected"),
    ("D4/3.3", "BENHADRIA", "2023-08-01", "2023-08-05", "calendar:2023:red"),
    ("D4/3.3", "MOHAMED BOUAZIZ", "2023-08-07", "2023-08-22", "calendar:2023:red"),
    ("D3/0.2", "NAWAL AKKAOUI", "2023-08-02", "2023-08-09", "calendar:2023:yellow"),
    ("D3/0.2", "HASSAN BOUTHOURST", "2023-08-19", "2023-08-26", "calendar:2023:yellow"),
    ("D1/3.3", "B10/1.5", "2023-08-03", "2023-08-11", "calendar:2023:corrected"),
    ("D1/2.3", "FATIMA", "2023-08-08", "2023-08-10", "calendar:2023:corrected"),
    ("D1/2.3", "NORA NAJY", "2023-08-11", "2023-08-15", "calendar:2023:corrected"),
    ("D4/2.3", "MESLOUHI AHMED", "2023-05-03", "2023-05-17", "calendar:2023"),
    ("D3/2.4", "SAFAA KHATRI", "2023-07-02", "2023-07-09", "calendar:2023"),
    ("D3/2.4", "GARAZI AZKUE", "2023-07-26", "2023-07-30", "calendar:2023"),
    ("D4/2.3", "khalid farhane", "2023-07-01", "2023-07-12", "calendar:2023"),
    ("D4/2.3", "HAKIM AKARIOU", "2023-07-23", "2023-07-27", "calendar:2023"),
    ("D4/3.3", "FOAD JNIAH", "2023-07-04", "2023-07-11", "calendar:2023:red"),
    ("D4/3.3", "imad ankour", "2023-07-23", "2023-07-27", "calendar:2023:red"),
    ("D4/3.3", "KARIM", "2023-07-28", "2023-07-31", "calendar:2023:red"),
    ("D3/0.2", "ZOUITENI ABDAL", "2023-07-27", "2023-07-31", "calendar:2023:yellow"),
    ("D1/3.3", "khalid", "2023-07-24", "2023-07-31", "calendar:2023"),
    ("D1/2.3", "hafida", "2023-07-22", "2023-07-31", "calendar:2023"),
    ("D4/0.4", "Mezian chouki", "2025-07-13", "2025-07-24", "calendar:2025:style-derived"),
    ("D4/1.2", "Maman de ikram", "2025-07-07", "2025-07-15", "calendar:2025:style-derived"),
    ("D4/1.2", "Yamina", "2025-07-16", "2025-08-01", "calendar:2025:style-derived"),
    ("D3/3.2", "Samir", "2025-07-21", "2025-07-24", "calendar:2025:style-derived"),
    ("D4/0.4", "Said", "2025-08-06", "2025-08-11", "calendar:2025:style-derived"),
    ("D4/0.4", "Ilhame atmani", "2025-08-11", "2025-08-18", "calendar:2025:style-derived"),
    ("D4/0.4", "Said", "2025-08-18", "2025-08-23", "calendar:2025:style-derived"),
    ("D4/1.2", "Fouad", "2025-08-09", "2025-08-15", "calendar:2025:style-derived"),
    ("D4/1.2", "Booking", "2025-08-16", "2025-08-23", "calendar:2025:style-derived"),
    ("D3/3.2", "Rabab", "2025-08-11", "2025-08-21", "calendar:2025:style-derived"),
    ("B6/2.7", "Sofi", "2025-08-12", "2025-08-15", "calendar:2025:style-derived"),
    ("B6/2.7", "Merakchiya", "2025-08-20", "2025-08-27", "calendar:2025:style-derived"),
    ("B6/1.4", "Kaoutar", "2025-08-18", "2025-08-24", "calendar:2025:style-derived"),
    ("D1/3.3", "Omar", "2025-06-17", "2025-06-25", "calendar:2025:style-derived"),
    ("D4/0.4", "Orida", "2025-06-24", "2025-06-29", "calendar:2025:style-derived"),
]

for code, guest, check_in, check_out, source in historical_calendar:
    projects.setdefault(code, {"ownerName": "Owner needs review", "rate": 0, "bookings": [], "expenses": [], "payments": []})
    projects[code]["bookings"].append(booking(
        f"{source}:{code}:{check_in}:{guest.lower().replace(' ', '-')}",
        guest,
        check_in,
        check_out,
        notes=f"Calendar-only record imported from Location dates.xlsx ({source}). Financial terms were not present.",
    ))

payload = {
    "schemaVersion": 1,
    "sourceFiles": ["HS service 2024.xlsx", "Location dates.xlsx"],
    "generatedAt": "2026-07-29",
    "warnings": [
        "The corrected August 2023 calendar block (rows 34-39) replaces the duplicate earlier block.",
        "Red and yellow 2023 calendar colors are preserved in booking notes; their business meaning was not inferred.",
        "2025 calendar-only date ranges are style-derived and carry no invented prices, commissions, or owner names.",
        "Rows without explicit stay dates were not converted into bookings.",
        "D4/2.3 has one 14-night/date-span mismatch and one stay without a checkout; both are retained with review notes.",
        "Unpriced plumber/carpenter service notes remain represented by the original workbook and were not assigned invented amounts.",
        "D1/2.3 owner-transfer dates were absent; they are grouped under the 2026-08 statement with an explicit note.",
    ],
    "projects": [
        {
            "legacyPropertyCode": code,
            "name": f"Rental {code}",
            "address": "",
            "currency": "DH",
            "rentalProperty": {
                "ownerName": data["ownerName"],
                "buildingNumber": code,
                "pricePerNight": data["rate"],
                "commissionRate": 0,
                "notes": "Imported from the legacy rental workbooks. Review missing owner/contact details.",
            },
            "rentalBookings": data["bookings"],
            "expenses": data["expenses"],
            "rentalOwnerPayments": data["payments"],
        }
        for code, data in sorted(projects.items())
    ],
}

all_ids = []
for project in payload["projects"]:
    all_ids.extend(item["legacySourceId"] for key in ("rentalBookings", "expenses", "rentalOwnerPayments") for item in project[key])
if len(all_ids) != len(set(all_ids)):
    raise RuntimeError("Duplicate legacySourceId values found")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {OUTPUT} with {len(payload['projects'])} properties and {len(all_ids)} records")
