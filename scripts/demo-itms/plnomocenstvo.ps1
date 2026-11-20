# Vytvorí modelovú kópiu záväzného vzoru 1a. Originál ostáva otvorený iba na čítanie.
param([Parameter(Mandatory)][string] $Vystup)
$ErrorActionPreference = 'Stop'
$koren = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$vzor = Get-Item (Join-Path $koren 'data/zdroje/PSK-SIEA-002-2023/akt3/PSK-SIEA-002-2023-DV-EFRR_bez_SZ/Prilohy/Priloha_1a_ZoNFP__Plnomoc.doc')
$wordApp = New-Object -ComObject Word.Application
try {
    $wordApp.Visible = $false
    $wordApp.DisplayAlerts = 0
    $wordApp.AutomationSecurity = 3
    $dokument = $wordApp.Documents.Open($vzor.FullName, $false, $true, $false)
    $polia = [ordered]@{
        'Splnomocniteľ' = 'Obec Chorvátsky Grob'
        'Sídlo' = 'Nám. Josipa Andriča 17, 900 25 Chorvátsky Grob'
        'IČO' = '00304760'
        'V zastúpení' = 'starostka obce (modelové zastúpenie)'
        'Splnomocnenec' = 'Eva Modelová (fiktívna osoba)'
        'Dátum narodenia' = '[anonymizované]'
        'Trvalé bydlisko' = '[anonymizované]'
        'Číslo OP/pasu' = '[anonymizované]'
        'Názov projektu' = 'Zníženie energetickej náročnosti budovy obecného úradu v obci Chorvátsky Grob'
    }
    $pocet = 0
    foreach ($odsek in $dokument.Paragraphs) {
        $rozsah = $odsek.Range.Duplicate
        $riadok = $rozsah.Text.TrimEnd([char]13)
        if ($riadok -match '^([^:]+?):\s*' -and $polia.Contains($Matches[1].Trim())) {
            $nazov = $Matches[1].Trim()
            $rozsah.End--
            $rozsah.Text = $riadok.Substring(0, $riadok.IndexOf(':') + 1) + '  ' + $polia[$nazov]
            $pocet++
        } elseif ($riadok -match '^V\.{3}') {
            $rozsah.End--
            $rozsah.Text = "Chorvátsky Grob, dňa 18. 9. 2025`t`tChorvátsky Grob, dňa 18. 9. 2025"
        }
    }
    if ($pocet -ne $polia.Count) { throw "Vzor 1a sa zmenil. Vyplnených polí: $pocet." }
    $pata = $dokument.Sections.Item(1).Footers.Item(1).Range
    $pata.Text = "DEMO  |  Rekonštrukcia pre test podateľne. Modelový dátum a osoby.`rMiesto pre osvedčovaciu doložku a podpisy zostáva vo vzorke prázdne."
    $pata.Font.Size = 8
    $dokument.ExportAsFixedFormat([IO.Path]::GetFullPath($Vystup), 17)
} finally {
    if ($dokument) { $dokument.Close(0) }
    $wordApp.Quit()
}
