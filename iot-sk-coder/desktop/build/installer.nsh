; NOVA — post-install Python dependency setup
; Runs pip install for the bridge server dependencies silently.

!macro customInstall
  DetailPrint "Installing Python bridge dependencies..."
  nsExec::ExecToLog 'pip install openai>=1.0 rich>=13.0 questionary>=2.0 ddgs>=6.0 beautifulsoup4>=4.12 python-docx>=1.0 openpyxl>=3.1 fpdf2>=2.7 --quiet'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONINFORMATION "Python packages could not be installed automatically.$\nRun this manually:$\n  pip install openai rich questionary ddgs beautifulsoup4 python-docx openpyxl fpdf2" IDOK
  ${EndIf}
!macroend

!macro customUnInstall
  ; Nothing to undo for pip packages
!macroend
