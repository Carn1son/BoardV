; BoardV file types: listed in "Open with" for .PcbDoc / .brd / .bvr, but never taking a type away
; from a program that already opens it (Altium, Eagle...). BoardV becomes the default only for types nobody handles.
!macro BV_EXT EXT
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "BoardV.Board" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
  ReadRegStr $0 HKCR "${EXT}" ""
  StrCmp $0 "" 0 +2
    WriteRegStr HKCU "Software\Classes\${EXT}" "" "BoardV.Board"
!macroend

!macro BV_UNEXT EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "BoardV.Board"
  ReadRegStr $0 HKCU "Software\Classes\${EXT}" ""
  StrCmp $0 "BoardV.Board" 0 +2
    DeleteRegValue HKCU "Software\Classes\${EXT}" ""
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Classes\BoardV.Board" "" "BoardV board"
  WriteRegStr HKCU "Software\Classes\BoardV.Board\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\BoardV.Board\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro BV_EXT ".PcbDoc"
  !insertmacro BV_EXT ".brd"
  !insertmacro BV_EXT ".bvr"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro BV_UNEXT ".PcbDoc"
  !insertmacro BV_UNEXT ".brd"
  !insertmacro BV_UNEXT ".bvr"
  DeleteRegKey HKCU "Software\Classes\BoardV.Board"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
