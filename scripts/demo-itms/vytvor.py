"""Obnoví prezentačné podania z verejných údajov a vzorov výzvy. Pozri demo/itms/README.md."""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED
import gzip
import json
import os
import shutil
import subprocess

import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Table, TableStyle
from reportlab.graphics.shapes import Drawing, Line, Rect, String

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo/itms"
CALL = "PSK-SIEA-002-2023-DV-EFRR"
FORM = "Formular_NFP401201G856.json"
FORM_PDF = "Ziadost_o_NFP_NFP401201G856.pdf"
PROXY = "Priloha_1a_Plnomocenstvo.pdf"
COUNCIL = "Priloha_3_Uznesenia.pdf"
CERT = "Priloha_6_Predrealizacny_certifikat.pdf"
PLAN = "Priloha_7_Projektova_dokumentacia.pdf"
BOOK = "Priloha_8_Rozpocet.xlsm"
COST = "Priloha_8_Podklad_k_oceneniu.pdf"
REJECTED = "Formular_NFP401201A973.json"
FULL = [FORM, FORM_PDF, PROXY, COUNCIL, CERT, PLAN, BOOK, COST]
BLUE = colors.HexColor("#204456")
GREY = colors.HexColor("#526169")


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def vyber(obj, fields):
    """Kopírujeme len explicitne vybrané polia, aj vo vnorených zoznamoch."""
    if isinstance(obj, list):
        return [vyber(v, fields) for v in obj]
    if isinstance(fields, str):
        return {k: obj[k] for k in fields.split() if k in obj}
    return {k: vyber(obj[k], sub) for k, sub in fields.items() if obj.get(k) is not None}


def formular(z):
    cesta = ROOT / "data/raw/itms21" / CALL / "zonfp" / f"{z['id']}.json.gz"
    with gzip.open(cesta, "rt", encoding="utf-8") as f:
        raw = json.load(f)
    zaklad = vyber(raw, "id kod nazov datumPredlozenia sumaZiadanaNFP sumaZiadanaCelkova "
                  "sumaZiadanaVZ percetnoZiadane dlzkaZiadanaCelkovaHlavnychAktivit "
                  "datumZiadanyZaciatkuHlavnychAktivit datumZiadanyKoncaHlavnychAktivit")
    zaklad.update(vyber(raw, {"vyzva": "kod", "kategoriaRegionov": "kodZdroj", "opatrenie": "kod"}))
    zaklad["ziadatel"] = vyber(raw["ziadatel"], "nazov ico") | vyber(raw["ziadatel"], {"pravnaForma": "kodZdroj nazovSk"})
    def aktivita(a):
        return vyber(a, "kod nazov datumZaciatkuPlanovany datumKoncaPlanovany") | vyber(a, {"typAkcieProgramu": {"opatrenie": "kod"}})
    zaklad["aktivity"] = [aktivita(a) for a in raw["aktivity"]]
    zaklad["polozkyRozpoctu"] = [vyber(p, "sumaOpravnenehoVydavku") | vyber(p, {"skupinaVydavkov": "nazovSk"})
                                 | {"aktivita": aktivita(p["aktivita"])} for p in raw["polozkyRozpoctu"]]
    zaklad["miestoRealizacieFull"] = [vyber(m, {"nuts3": "nazovSk", "nuts4": "nazovSk", "nuts5": "nazovSk"})
                                      | vyber(m, "lokalita") for m in raw["miestoRealizacieFull"]]
    for key in ("ukazovatelZiadanyVystupu", "ukazovatelZiadanyVysledku"):
        zaklad[key] = []
        for uk in raw[key]:
            p = uk["ukazovatelProjektovySC"]["ukazovatelProjektovy"]
            definicia = vyber(p, "kod nazovSk") | vyber(p, {"mernaJednotka": "nazovSk"})
            zaklad[key].append(vyber(uk, "vychodiskovaHodnotaSpolu cielovaHodnotaSpolu") |
                               {"ukazovatelProjektovySC": {"ukazovatelProjektovy": definicia}})
    zaklad["popis"] = z["popis"]
    zaklad["ucel"] = z["ucel"].split("\n")[0] if z["id"] == 206978 else z["ucel"]
    zaklad["_zdroj"] = f"https://api.itms21.sk/public/v1/zonfp/id/{z['id']}"
    zaklad["_poznamka"] = "Výber verejných údajov na skúšku príjmu. Historické rozhodnutie je mimo vstupu hodnotiteľa."
    return zaklad


def cis(n, d=2):
    return f"{n:,.{d}f}".replace(",", " ").replace(".", ",")


def odst(text, velkost=11, bold=False):
    return Paragraph(text, ParagraphStyle("text", fontName="BodyBold" if bold else "Body",
                     fontSize=velkost, leading=velkost * 1.32, textColor=BLUE if bold else colors.black,
                     spaceBefore=5, spaceAfter=5))


def tabulka(rows, widths):
    data = [[odst(escape(str(value)), 10, i == 0) for value in row] for i, row in enumerate(rows)]
    return Table(data, colWidths=[w * mm for w in widths], hAlign="LEFT", repeatRows=1,
                 style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e3ebec")),
                                   ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7f7")]),
                                   ("LINEBELOW", (0, -1), (-1, -1), .5, GREY)]))


def pdf(cesta, skupina, obsah):
    def okraj(c, d):
        c.setFillColor(BLUE)
        c.setFont("BodyBold", 10)
        c.drawString(20*mm, 279*mm, skupina)
        c.setFont("Body", 9)
        c.drawRightString(190*mm, 279*mm, "NFP401201G856")
        c.setStrokeColor(GREY)
        c.line(20*mm, 275*mm, 190*mm, 275*mm)
        c.line(20*mm, 19*mm, 190*mm, 19*mm)
        c.setFont("Body", 8)
        c.drawString(20*mm, 14*mm, "DEMO   |   Rekonštrukcia pre test podateľne. Historické prílohy žiadateľa nie sú k dispozícii.")
        c.drawRightString(190*mm, 14*mm, str(d.page))
    doc = SimpleDocTemplate(str(cesta), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                            topMargin=30*mm, bottomMargin=25*mm, title=skupina, author="Demo podateľne")
    doc.build(obsah, onFirstPage=okraj, onLaterPages=okraj)


def schema():
    d = Drawing(470, 150)
    for x, y, w, h, label in [(15, 88, 120, 40, "Fotovoltické panely"), (175, 88, 105, 40, "Rozvádzač"),
                              (320, 88, 137, 40, "Prevádzka úradu"), (15, 12, 120, 40, "Tepelné čerpadlo"),
                              (175, 12, 105, 40, "Rozvod tepla"), (320, 12, 137, 40, "Vykurované priestory")]:
        d.add(Rect(x, y, w, h, strokeColor=BLUE, fillColor=colors.HexColor("#f3f6f5")))
        d.add(String(x+w/2, y+16, label, fontName="Body", fontSize=10, textAnchor="middle"))
    for y in [32, 108]:
        for a, b in [(135, 175), (280, 320)]:
            d.add(Line(a, y, b, y, strokeColor=BLUE))
            d.add(Line(b-5, y+3, b, y, strokeColor=BLUE))
            d.add(Line(b-5, y-3, b, y, strokeColor=BLUE))
    return d


# Modelové výmery na ukážku rozpočtovania. Sumy za aktivity pochádzajú z ITMS21+.
POLOZKY = {
    "Zateplenie obvodového plášťa": ("Kontaktné zateplenie fasády s povrchovou úpravou", "m²", 720, 720),
    "Vykurovací systém": ("Úprava a vyregulovanie vykurovacích okruhov", "súbor", 1, 25),
    "Osvetlenie": ("Výmena svietidla vrátane montáže a zapojenia", "ks", 86, 3.44),
    "Projektová dokumentácia": ("Projekt obnovy budovy a profesijné časti", "súbor", 1, 240162.02),
    "Systémy chladenia a vetrania": ("Vetracia jednotka s rozvodmi a reguláciou", "ks", 2, 0.6),
    "Kvalita vnútorného prostredia": ("Prvky regulácie výmeny vzduchu v miestnostiach", "súbor", 1, 1059.55),
    "Ostatné okrem softvéru": ("Prípravné a dokončovacie práce podľa výkazu", "súbor", 1, 0),
    "Zariadenia OZE - výroba elektriny": ("Fotovoltická zostava vrátane striedača", "súbor", 1, 3.3),
    "Zariadenia OZE - výroba tepla": ("Tepelné čerpadlo vrátane napojenia", "súbor", 1, 23.1),
}


def podklady(dir, z):
    uk = {u["kod"]: u for u in z["ukazovatele"]}
    pe = uk["PSKPRCR26b"]
    pred, po = pe["vychodisko"], pe["ciel"]
    emisie = uk["PSKPRCR29"]
    plocha = uk["PSKPRCO19"]["ciel"]
    pdf(dir / FORM_PDF, "Program Slovensko  /  Tlačový výpis ŽoNFP", [
        odst("Žiadosť o poskytnutie nenávratného finančného príspevku", 20, True),
        odst("Výber verejných údajov zo žiadosti  ·  Podaná 19. septembra 2025"),
        odst("1. Identifikácia žiadateľa", 13, True),
        tabulka([["Názov a právna forma", "IČO"], [z["ziadatel"]["nazov"] + " · obec", z["ziadatel"]["ico"]]], [115, 50]),
        odst("5. Identifikácia projektu", 13, True), odst(z["nazov"]),
        odst("Výzva " + CALL + "  ·  Opatrenia 2.1.2 a 2.2.2"),
        odst("6.A Miesto realizácie", 13, True),
        odst("Bratislavský kraj, okres Senec, obec Chorvátsky Grob. Budova obecného úradu na Námestí Josipa Andriča."),
        odst("7. Popis projektu", 13, True),
        *[odst(escape(p)) for p in z["popis"].split("\n")[:3]],
        odst("Prepojenie s dátami žiadosti", 13, True),
        odst("Číslo projektu v záhlaví identifikuje ten istý záznam vo verejnom registri a v priloženom súbore JSON. "
             "Výpis zachytáva údaje podané žiadateľom. Na administratívne overenie jednotlivých podmienok slúžia samostatné dokumenty v spise."),
        PageBreak(), odst("9. Harmonogram realizácie aktivít", 14, True),
        odst(f"Začiatok hlavných aktivít {z['zaciatokHlavnychAktivit']} · koniec {z['koniecHlavnychAktivit']}."),
        odst("10. Merateľné ukazovatele", 13, True),
        tabulka([["Kód ITMS21+", "Jednotka", "Východisko", "Cieľ"]] +
                [[u["kod"], u["jednotka"], "—" if u["vychodisko"] is None else cis(u["vychodisko"], 4),
                  cis(u["ciel"], 4)] for u in uk.values()], [52, 43, 35, 35]),
        odst("11.C Požadovaná výška NFP", 13, True),
        tabulka([["Suma žiadaná celkovo", "Žiadaný NFP", "Vlastné zdroje"],
                 [cis(z["sumaZiadanaCelkova"]) + " €", cis(z["sumaZiadanaNFP"]) + " €", cis(z["sumaZiadanaVZ"]) + " €"]], [60, 55, 50]),
        odst("Zostavené z verejného detailu ITMS21+. Zobrazené sú vybrané časti formulára v číslovaní výzvy. Formálne podanie a elektronické podpísanie prebiehajú mimo tejto ukážky.")
    ])
    pdf(dir / COUNCIL, "Obecné zastupiteľstvo  /  Výpis pre spis", [
        odst("Výpis z uznesení o schválení rozvojových dokumentov", 19, True),
        odst("Obec Chorvátsky Grob  ·  IČO 00304760"),
        odst("Program hospodárskeho rozvoja a sociálneho rozvoja", 13, True),
        odst("Na zasadnutí dňa 9. septembra 2025 zastupiteľstvo uznesením č. 44/2025 schválilo program rozvoja obce na roky 2024 až 2030."),
        tabulka([["Za", "Proti", "Zdržali sa", "Neprítomní"], ["8", "0", "1", "2"]], [40, 40, 40, 45]),
        odst("Územný plán obce", 13, True),
        odst("Územný plán obce schválilo zastupiteľstvo 5. marca 2001 uznesením č. 6/OZ-2001. Pre konkrétnu stavbu sa posudzuje aj príslušné znenie zmien a doplnkov."),
        odst("Podklad pre kontrolóra", 13, True),
        odst("Číslo, dátum a výsledok hlasovania k programu sú na strane 7 zverejnených uznesení zo zasadnutia. Údaje o prijatí územného plánu uvádzajú aj jeho zmeny a doplnky č. 14/2019. Odkazy na obe listiny sú v návode k tejto sade."),
    ])
    pdf(dir / CERT, "Energetická hospodárnosť  /  Príloha 6", [
        odst("Predrealizačný energetický certifikát", 20, True),
        odst("Modelový výpis údajov pred obnovou  ·  EC-DEMO-G856"),
        odst("Identifikácia posudzovanej budovy", 13, True),
        tabulka([["Položka", "Údaj"], ["Budova", "Obecný úrad, administratívna budova"],
                 ["Umiestnenie", "Nám. Josipa Andriča 3672/17, Chorvátsky Grob, parcela 247/1"],
                 ["Využitie", "Sídlo obecného úradu, budova skolaudovaná v roku 1942"]], [45, 120]),
        odst("Energetická hospodárnosť vo východiskovom stave", 13, True),
        tabulka([["Ukazovateľ", "Hodnota", "Jednotka"], ["Dodaná energia", "90,1", "kWh/(m².rok)"],
                 ["Globálny ukazovateľ primárnej energie", "115,4", "kWh/(m².rok)"],
                 ["Energetická trieda podľa primárnej energie", "B", "trieda"],
                 ["Primárna energia za rok", cis(pred, 4), "MWh/rok"],
                 ["Odhad emisií skleníkových plynov", cis(emisie["vychodisko"], 4), "t CO₂ ekv./rok"]], [88, 36, 41]),
        odst("Pôvod údajov", 13, True),
        odst("Hodnoty a trieda pochádzajú z verejného opisu a ukazovateľov ŽoNFP. Číslo vzorky je modelové. Registráciu certifikátu a oprávnenie vydavateľa možno potvrdiť len z originálu.")
    ])
    pdf(dir / PLAN, "Projektová dokumentácia  /  SO 01", [
        odst("Technická správa k obnove obecného úradu", 20, True),
        odst(z["nazov"]), odst("Predmet a navrhované opatrenia", 13, True),
        odst("Administratívna budova na parcele 247/1 slúži na výkon obecnej správy. Obnova zahŕňa zateplenie plášťa, úpravy vykurovania, vetrania a osvetlenia. Nové zdroje elektriny a tepla majú kryť časť vlastnej spotreby budovy."),
        odst("Projektové energetické hodnotenie", 13, True),
        tabulka([["Ukazovateľ", "Pred obnovou", "Plán po obnove"],
                 ["Primárna energia (MWh/rok)", cis(pred, 4), cis(po, 4)],
                 ["Emisie (t CO₂ ekv./rok)", cis(emisie["vychodisko"], 4), cis(emisie["ciel"], 4)],
                 ["Globálna energetická trieda", "B", "A1"]], [75, 45, 45]),
        odst(f"Pokles ročnej primárnej energie vychádza na {cis(pred-po, 4)} MWh, čo zodpovedá úspore {cis(100*(pred-po)/pred, 2)} %. Cieľová podlahová plocha z vykazovaného ukazovateľa je {cis(plocha)} m²."),
        odst("Stavebná a statická časť", 13, True),
        odst("Pri zaťažení strechy panelmi sa preveruje únosnosť nosnej konštrukcie, kotvenie a lokálne účinky vetra. Doloženie statického výpočtu a overenie povoľovacím orgánom vyžadujú originálnu dokumentáciu."),
        PageBreak(), odst("Výkresová časť a ukazovatele OZE", 18, True),
        odst("SO 01  /  Schéma zapojenia technických zariadení", 13, True), schema(),
        odst("Funkčná schéma pre demo, bez mierky. Nezobrazuje pôdorys ani trasy skutočných prípojok."),
        tabulka([["Technológia", "Cieľová kapacita (MW)", "Výroba (MWh/rok)"],
                 ["Elektrina z OZE", cis(uk["PSKPRCO22a"]["ciel"], 4), cis(uk["PSKPRCR31a"]["ciel"], 4)],
                 ["Teplo z OZE", cis(uk["PSKPRCO22b"]["ciel"], 4), cis(uk["PSKPRCR31b"]["ciel"], 4)]], [50, 62, 53]),
        odst("Podklad pre kontrolu", 13, True),
        odst("Kapacity sú prevzaté zo štruktúrovaných ukazovateľov žiadosti. Ide o plánované hodnoty. Montáž, revíziu a meranie po realizácii treba doložiť samostatnými dokladmi.")
    ])
    sekcie, rows = [], [["Modelová položka", "Množstvo", "Bez DPH za MJ (€)", "Spolu s DPH (€)"]]
    trh = [["Logický celok", "Ponuka A", "Ponuka B", "Ponuka C", "Priemer (€)"]]
    for p in z["rozpocet"]:
        nazov, mj, pocet, parameter = POLOZKY[p["aktivita"]]
        cena = p["suma"] / 1.23 / pocet
        rows.append([nazov, f"{pocet} {mj}", cis(cena, 4), cis(p["suma"])])
        prieskum = p["aktivita"] == "Projektová dokumentácia" or p["opatrenie"] == "2.2.2"
        if prieskum:
            priemer = p["suma"]
            rozdiel = round(priemer * .04, 2)
            trh.append([nazov, cis(priemer + rozdiel), cis(priemer - rozdiel), cis(priemer), cis(priemer)])
        polozka = dict(nazov=nazov, mj=mj, pocet=pocet, jednotkovaCenaBezDph=cena, sposob=1 if prieskum else 4,
                       opis="Modelová kalkulácia. Rozpis v Prílohe 8 – Podklad k oceneniu.")
        if p["aktivita"] == "Ostatné okrem softvéru":
            polozka["skupina"] = "021 Stavby"
        sekcie.append(dict(sekcia=p["aktivita"], parameter=parameter, polozky=[polozka]))
    pdf(dir / COST, "Rozpočet projektu  /  Podklad k oceneniu", [
        odst("Položková kalkulácia obnovy", 20, True), odst("SO 01  ·  Modelové výmery a jednotkové ceny"),
        odst("Kalkulácia rozkladá sumy jednotlivých aktivít z ITMS21+ na modelové množstvá a ceny. Predpoklad pre výpočet je DPH 23 %. Zaokrúhlenie jednotkových cien je len na zobrazenie."),
        tabulka(rows, [74, 22, 31, 38]),
        odst(f"Súčet položiek s DPH   {cis(sum(p['suma'] for p in z['rozpocet']))} €", 13, True),
        odst("Metóda a pôvod údajov"),
        odst("Pre stavebné práce je v zošite zvolený položkový rozpočet. Pre projektovú dokumentáciu a zariadenia OZE sa používa modelové vyhodnotenie troch cien na ďalšej strane."),
        PageBreak(), odst("Vyhodnotenie modelového prieskumu trhu", 18, True),
        odst("Cenová hladina pred podaním  ·  Modelový dátum 8. septembra 2025"),
        odst("Technický rozsah v každom stĺpci je totožný. Porovnávajú sa celkové ceny s DPH za dodanie dokumentácie, alebo celého zariadenia s montážou a uvedením do prevádzky. Pre každý celok vstupuje do rozpočtu aritmetický priemer troch súm."),
        tabulka(trh, [55, 28, 28, 28, 26]), odst("Pôvod cien", 13, True),
        odst("Ponuky A, B a C sú modelové ceny vytvorené z verejnej sumy aktivity. Slúžia na skúšku väzby medzi podkladom a rozpočtom. Doklad o vykonaní prieskumu by obsahoval aj pôvodné ponuky a podklady k osloveniu dodávateľov.")
    ])
    return dict(ziadatel=z["ziadatel"]["nazov"], projekt=z["nazov"], platcaDph=False, sadzbaDph=.23,
                opatrenia="Budovy a OZE", schvalenyRadou=False, sekcie=sekcie,
                budova=dict(katastralneUzemie="Chorvátsky Grob", lv="DEMO", supisneCislo="3672",
                            pravnyVztah="výlučné vlastníctvo budovy žiadateľom", kategoria="administratívna budova",
                            triedaPred="B", triedaPo="A1", guPePredKwhM2=115.4, plochaPredM2=pred*1000/115.4,
                            guPePoKwhM2=po*1000/plocha, plochaPoM2=plocha,
                            prevadzka=dict(hodinDenne=8, dniTyzdenne=5, tyzdnovRocne=50),
                            ozeElMW=uk["PSKPRCO22a"]["ciel"], ozeTepMW=uk["PSKPRCO22b"]["ciel"],
                            emisieCO2T=dict(vych=emisie["vychodisko"], plan=emisie["ciel"]),
                            ozeVyrobaMWh=dict(elVych=uk["PSKPRCR31a"]["vychodisko"], elPlan=uk["PSKPRCR31a"]["ciel"],
                                              tepVych=uk["PSKPRCR31b"]["vychodisko"], tepPlan=uk["PSKPRCR31b"]["ciel"])),
                poznamka="DEMO – rekonštrukcia. Výmery, ceny za MJ, prevádzka, LV a odpoveď o rade sú modelové.")


def sken(cesta):
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=A4, invariant=True)
    with pdfium.PdfDocument(cesta) as pdf_doc:
        for p in pdf_doc:
            bitmap = p.render(scale=2)
            c.drawImage(ImageReader(bitmap.to_pil().convert("L")), 0, 0, *A4)
            c.showPage()
    c.save()
    return stream.getvalue()


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--pouzi-office-subory", action="store_true",
                        help="Použiť už vygenerované plnomocenstvo a XLSM z demo/itms/subory.")
    args = parser.parse_args()
    for font, file in [("Body", "calibri.ttf"), ("BodyBold", "calibrib.ttf")]:
        pdfmetrics.registerFont(TTFont(font, str(Path(os.environ["WINDIR"]) / "Fonts" / file)))
    ziadosti = json.loads((ROOT / "data/odvodene" / CALL / "ziadosti.json").read_text(encoding="utf-8"))
    z = next(z for z in ziadosti if z["id"] == 206978)
    zamietnuta = next(z for z in ziadosti if z["id"] == 202100)
    with TemporaryDirectory() as tmp:
        stage = Path(tmp)
        write_json(stage / FORM, formular(z))
        write_json(stage / REJECTED, formular(zamietnuta))
        spec = podklady(stage, z)
        if args.pouzi_office_subory:
            for nazov in (PROXY, BOOK):
                shutil.copyfile(OUT / "subory" / nazov, stage / nazov)
        else:
            write_json(stage / "spec.json", spec)
            subprocess.run(["pwsh", "-NoProfile", "-File", str(Path(__file__).with_name("plnomocenstvo.ps1")),
                            "-Vystup", str(stage / PROXY)], check=True)
            subprocess.run(["node", str(Path(__file__).with_name("rozpocet.ts")), str(stage / "spec.json"), str(stage / BOOK)], check=True)
        baliky = {"01-komplet": FULL, "02-pred-doplnenim": [FORM, FORM_PDF, PROXY, COUNCIL, PLAN],
                  "03-doplnenie": [CERT, COST, BOOK], "04-sken": FULL, "05-historicky-nalez": [REJECTED]}
        for meno, subory in baliky.items():
            with ZipFile(stage / f"{meno}.zip", "w", ZIP_DEFLATED) as archive:
                for f in subory:
                    if meno == "04-sken" and f == COUNCIL:
                        archive.writestr(f, sken(stage / f))
                    else:
                        archive.write(stage / f, f)
        (OUT / "subory").mkdir(parents=True, exist_ok=True)
        for f in FULL:
            shutil.copyfile(stage / f, OUT / "subory" / f)
        for meno in baliky:
            shutil.copyfile(stage / f"{meno}.zip", OUT / f"{meno}.zip")


if __name__ == "__main__":
    main()
