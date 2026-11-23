/**
 * Chyba vo vstupe od používateľa: poškodený alebo nepodporovaný súbor, prázdne podanie či doplnenie. Server ju vráti
 * ako 400 s touto správou, ostatné výnimky sú chyby aplikácie (500). Správa má povedať, čo je zlé a čo urobiť.
 */
export class ChybaVstupu extends Error {}
