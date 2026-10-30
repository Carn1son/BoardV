<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png"><img src="docs/logo-light.png" width="560" alt="BoardV — .brd for the grown-ups"></picture></p>

<p align="center">Altium PCB viewer for Windows and Android. Components, nets, values and BOM at a glance.</p>

<p align="center">
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV.apk"><b>Android APK</b></a> ·
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV-Setup.exe"><b>Windows Installer</b></a>
</p>

## Features

### Formats
- Altium `.PcbDoc` opened directly
- `.brd`, `.bdv`, `.bvr`, `.asc`, `.cad`, `.cst`, `.kicad_pcb`, `.zip`
- BOM and pick-and-place CSV import

### Board and Nets
- Top, bottom and both-side views
- Accurate pad shapes, outlines and rotations
- Net highlighting on pin click
- Custom net colour rules
- Search by component, net and value
- Component card with pins, nets and datasheet search

### 3D View
- Embedded STEP models from Altium with original colours
- Through holes and mounting holes

### BOM
- Placement highlighting per BOM line
- CSV copy and `.xlsx` export with check marks

### Phone Scanner
- Scans QR, DataMatrix and barcodes from reels
- Decodes part numbers of major passive component vendors
- Checks scanned parts against the BOM on the PC
- Encrypted local Wi-Fi link

### Application
- Dark and light themes with full colour customisation
- English and Russian interface
- Remappable hotkeys in any keyboard layout
- Settings export and import
- Automatic updates

## Installation
- **Android:** install `BoardV.apk`
- **Windows:** install `BoardV-Setup.exe`

## Build
Every push to `main` builds the APK and Windows executables with GitHub Actions and publishes them to [Releases](https://github.com/Carn1son/BoardV/releases).

```
src/        viewer sources and build script
www/        web app shared by both wrappers
android/    Android WebView wrapper
src/win/    Windows WebView2 wrapper
```
