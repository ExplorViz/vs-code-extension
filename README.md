# ExplorViz VS Code Extension

## Extension ohne Extension-Host-Debugger starten

**F5** beziehungsweise **Run Extension** startet den Extension Development Host
mit einem angehängten Debugger. Um die Extension im Entwicklungsmodus ohne diesen
Debugger zu starten:

1. Beende einen laufenden F5-Start mit **Shift+F5**.
2. Öffne ein Terminal im Stammverzeichnis dieses Extension-Projekts.
3. Kompiliere die Extension und öffne ein neues VS-Code-Fenster:

   ```bash
   npm run compile
   code --new-window --extensionDevelopmentPath="$PWD"
   ```

Das neue Fenster lädt die Extension aus dem aktuellen Projektverzeichnis. Für
den normalen Betrieb einer installierten Extension ist kein Extension-Host-
Debugger erforderlich.

## Java-Projekt über ExplorViz debuggen

Öffne das Java-Projekt, das du debuggen möchtest, in VS Code. Das Projekt muss
eine passende VS-Code-Debug-Konfiguration bereitstellen. Öffne dann mit
**Cmd+Shift+P** die Befehlspalette und wähle **ExplorViz: Start Debugging**.
VS Code startet den Debug-Workflow für das geöffnete Projekt. Dafür muss die
ExplorViz-Webview nicht geöffnet sein.
