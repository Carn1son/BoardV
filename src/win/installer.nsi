; BoardV for Windows (WebView2): per-user install, no admin rights.
; makensis -DVERSION=2100.2.27 -DAPPNAME="BoardV" -DOUTFILE=BoardV-Setup.exe -DEXE=path\BoardV.exe installer.nsi
; Silent: /S ; /R (or --force-run, as Electron's updater passes) starts BoardV again afterwards.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!ifndef APPNAME
  !define APPNAME "BoardV"
!endif
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef OUTFILE
  !define OUTFILE "BoardV-Setup.exe"
!endif
!ifndef EXE
  !define EXE "BoardV.exe"
!endif
!define PROGID "BoardV.Board"
!if "${APPNAME}" != "BoardV"
  !undef PROGID
  !define PROGID "BoardV.Lite"
!endif
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${UNKEY}" "InstallLocation"
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} — просмотр плат"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "carnison"
VIAddVersionKey "LegalCopyright" "carnison"
VIAddVersionKey "FileVersion" "${VERSION}"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\BoardV.exe"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

; BoardV file types: listed in "Open with", and the default only for types nobody else opens (Altium, Eagle... keep theirs)
!macro BV_EXT EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  !if "${APPNAME}" == "BoardV"
  WriteRegStr HKCU "Software\Classes\Applications\BoardV.exe\SupportedTypes" "${EXT}" ""
  !endif
  ReadRegStr $0 HKCR "${EXT}" ""
  StrCmp $0 "" 0 +2
    WriteRegStr HKCU "Software\Classes\${EXT}" "" "${PROGID}"
!macroend
!macro BV_UNEXT EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}"
  ReadRegStr $0 HKCU "Software\Classes\${EXT}" ""
  StrCmp $0 "${PROGID}" 0 +2
    DeleteRegValue HKCU "Software\Classes\${EXT}" ""
!macroend

Function CloseRunning
  ; a running BoardV holds its exe: ask it to close and wait a little
  ; only the copy in this folder (another BoardV, e.g. the old one, keeps running)
  nsExec::Exec `powershell -NoProfile -Command "Get-Process BoardV -EA 0 | ? { $$_.Path -like '$INSTDIR\*' } | % { $$_.CloseMainWindow() | Out-Null }"`
  Sleep 1500
  nsExec::Exec `powershell -NoProfile -Command "Get-Process BoardV -EA 0 | ? { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  Sleep 300
FunctionEnd

Function RemoveElectron
  ; the earlier Electron build lived in the same folder: its runtime files go, settings stay
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\swiftshader"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\Uninstall BoardV.exe"
  ; and its "Programs and Features" entry
  StrCpy $1 0
  loop:
    EnumRegKey $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $1
    StrCmp $2 "" done
    ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "DisplayName"
    ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2" "UninstallString"
    StrCmp $3 "${APPNAME}" 0 next
    StrCmp $2 "${APPNAME}" next
    ${WordFind} "$4" "Uninstall BoardV.exe" "E+1{" $5
    IfErrors next
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$2"
    Goto loop
    next:
    IntOp $1 $1 + 1
    Goto loop
  done:
FunctionEnd

Section "BoardV"
  Call CloseRunning
  SetOutPath "$INSTDIR"
  Call RemoveElectron
  File "/oname=BoardV.exe" "${EXE}"
  FileOpen $0 "$INSTDIR\installed.flag" w
  FileWrite $0 "${VERSION}"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\BoardV.exe"
  IfSilent +2
    CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\BoardV.exe"

  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${APPNAME} board"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\BoardV.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\BoardV.exe" "%1"'
  !if "${APPNAME}" == "BoardV"
  WriteRegStr HKCU "Software\Classes\Applications\BoardV.exe\shell\open\command" "" '"$INSTDIR\BoardV.exe" "%1"'
  !endif
  !insertmacro BV_EXT ".PcbDoc"
  !insertmacro BV_EXT ".brd"
  !insertmacro BV_EXT ".bvr"
  !insertmacro BV_EXT ".bdv"
  !insertmacro BV_EXT ".cad"
  !insertmacro BV_EXT ".cst"
  !insertmacro BV_EXT ".kicad_pcb"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "carnison"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\BoardV.exe"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" $0
SectionEnd

Function .onInstSuccess
  ; an update (/R from BoardV, --force-run from the old Electron updater) starts BoardV again
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/R" $1
  IfErrors 0 run
  ClearErrors
  ${GetOptions} $0 "--force-run" $1
  IfErrors 0 run
  Return
  run:
  Exec '"$INSTDIR\BoardV.exe"'
FunctionEnd

Section "Uninstall"
  nsExec::Exec `powershell -NoProfile -Command "Get-Process BoardV -EA 0 | ? { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
  !insertmacro BV_UNEXT ".PcbDoc"
  !insertmacro BV_UNEXT ".brd"
  !insertmacro BV_UNEXT ".bvr"
  !insertmacro BV_UNEXT ".bdv"
  !insertmacro BV_UNEXT ".cad"
  !insertmacro BV_UNEXT ".cst"
  !insertmacro BV_UNEXT ".kicad_pcb"
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  !if "${APPNAME}" == "BoardV"
  DeleteRegKey HKCU "Software\Classes\Applications\BoardV.exe"
  !endif
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$INSTDIR\BoardV.exe"
  Delete "$INSTDIR\installed.flag"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
SectionEnd
