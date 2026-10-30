<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png"><img src="docs/logo-light.png" width="560" alt="BoardV"></picture></p>

<p align="center">PCB viewer for Android and Windows. Open an Altium <code>.PcbDoc</code> and see parts, nets, values and the BOM.</p>

<p align="center">
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV.apk"><b>Android</b></a> ·
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV-Setup.exe"><b>Windows installer</b></a> ·
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV-portable.exe"><b>Windows portable</b></a>
</p>

## Features

### Formats
- Altium `.PcbDoc`, opened directly
- `.brd`: Test_Link, encrypted, BRD2, Eagle
- `.bdv`, `.bvr`, `.asc`, `.cad`, `.cst`
- KiCad `.kicad_pcb`
- `.zip` archives with a board inside
- BOM or placement CSV to add part values

### Board view
- Top, bottom and both sides
- Rotation in both directions and board flip
- Real pad shapes, sizes and angles
- Pin 1 markers
- Board outline, cutouts and mounting holes

### Nets and parts
- Tap a pin to highlight its net
- Separate colours for power and ground
- Custom net colours by name or mask
- Search by part, net and value
- Part card with pins, nets, package and value
- Copy and datasheet search buttons

### 3D view
- Embedded STEP models from `.PcbDoc`
- Board, pads and holes for other formats
- Key `3` for 3D, `2` for 2D

### BOM
- Grouped list with part placement on the board
- Copy as CSV
- Export to `.xlsx` with check marks

### Phone scanner
- Scan reel and tape labels with the phone
- QR, DataMatrix and barcodes
- Part numbers decoded for common capacitor and resistor makers
- Match result shown on the phone and marked in the PC BOM
- Local Wi-Fi link, encrypted, confirmed on the PC

### Interface
- Themes, day and night modes
- Colour and label settings
- Battery saver
- Remappable hotkeys
- Russian and English
- Settings export and import
- Built-in updates

## Install
- **Android:** download `BoardV.apk` and install it. Updates are installed from the app.
- **Windows:** run `BoardV-Setup.exe`, or use `BoardV-portable.exe` without installing. Windows 10 or 11 is required.

## Build
Every push to `main` builds the APK and the Windows app in GitHub Actions and publishes them in [Releases](https://github.com/Carn1son/BoardV/releases).

```
src/       viewer source and build script
src/win/   Windows app, C# and WebView2
android/   Android app
www/       built web app used by both
```
