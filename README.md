
# 🧭 Anleitung: Setup zur Visualisierung eines Snapshots aus der VS Code Extension in ExplorViz

Im Folgenden wird erklärt, welche Services in welcher Reihenfolge gestartet werden müssen, um einen von der **VS Code Extension** erzeugten **Snapshot** in **ExplorViz** visualisierbar zu machen.

---

## 🏁 Voraussetzungen

- **Docker** und **Docker Compose** installiert  
- **Node.js** und **npm** installiert    
- Optional: **MongoDB Compass** zur Verwaltung der Datenbank, GitBash unter Windows

---

## 🚀 Schritt-für-Schritt Anleitung

### 0. Wechsel ins Home-Verzeichnis
```bash
cd ~
```

---

### 1. Deployment Repository klonen
```bash
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/deployment.git
```

---

### 2. (Nur unter Windows)
Die `.sh`-Skripte in den folgenden Ordnern von **CRLF → LF** konvertieren:
- `deployment/docker/compose/configurations/kafka`
- `deployment/docker/compose/configurations/cassandra`

---

### 3. Start der benötigten Services
```bash
cd deployment/docker/compose
docker compose --env-file ../.env -f compose.extra.yaml up -d kafka cassandra
docker compose --env-file ../.env -f compose.extra.yaml up -d init-kafka init-cassandra
docker compose --env-file ../.env -f compose.extra.yaml up -d schema-registry
docker compose --env-file ../.env -f compose.extra.yaml up -d otel-collector
docker compose --env-file ../.env -f compose.extra.yaml up -d mongo-code
```

---

### 4. Start des **Span Service**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/span-service.git
cd span-service
git checkout visualize-debug-session
./gradlew quarkusDev
```

---

### 5. Start des **User Service**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/user-service.git
cd user-service
git checkout visualize-debug-session
./gradlew quarkusDev
```

---

### 6. Start des **Frontend**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/frontend.git
cd frontend
git checkout r3f-visualize-debug-state
npm install
npm run dev
```

> 📝 **Hinweis:**  
> Falls Ports angepasst werden müssen, ändere in der `.env` Datei:  
> ```bash
> VITE_USER_SERV_URL=http://localhost:8073
> ```

---

### 7. Registrierung der Kafka Schemas

Nutze **Postman** oder **curl**, um folgende zwei POST-Anfragen zu senden:

#### 7.1 Token Events Table Value
**URL:**  
```
http://localhost:8081/subjects/token-events-table-value/versions/
```

**Payload:**
```json
{"schema":"{\"type\":\"record\",\"name\":\"TokenEvent\",\"namespace\":\"net.explorviz.avro\",\"fields\":[{\"name\":\"type\",\"type\":{\"type\":\"enum\",\"name\":\"EventType\",\"symbols\":[\"CREATED\",\"DELETED\",\"ACCESS_GRANTED\",\"ACCESS_REVOKED\",\"CLONED\"]}},{\"name\":\"token\",\"type\":{\"type\":\"record\",\"name\":\"LandscapeToken\",\"fields\":[{\"name\":\"value\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"ownerId\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"secret\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"created\",\"type\":\"long\"},{\"name\":\"alias\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"isRequestedFromVSCodeExtension\",\"type\":\"boolean\", \"default\": false},{\"name\":\"projectName\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}, \"default\": \"\"},{\"name\":\"commitId\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}, \"default\": \"\"}]}},{\"name\":\"clonedToken\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}}]}"}
```

#### 7.2 Token Events Value
**URL:**  
```
http://localhost:8081/subjects/token-events-value/versions/
```

**Payload:**
```json
{"schema":"{\"type\":\"record\",\"name\":\"TokenEvent\",\"namespace\":\"net.explorviz.avro\",\"fields\":[{\"name\":\"type\",\"type\":{\"type\":\"enum\",\"name\":\"EventType\",\"symbols\":[\"CREATED\",\"DELETED\",\"ACCESS_GRANTED\",\"ACCESS_REVOKED\",\"CLONED\"]}},{\"name\":\"token\",\"type\":{\"type\":\"record\",\"name\":\"LandscapeToken\",\"fields\":[{\"name\":\"value\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"ownerId\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"secret\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"created\",\"type\":\"long\"},{\"name\":\"alias\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}},{\"name\":\"isRequestedFromVSCodeExtension\",\"type\":\"boolean\",\"default\":false},{\"name\":\"projectName\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}, \"default\": \"\"},{\"name\":\"commitId\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}, \"default\": \"\"}]}},{\"name\":\"clonedToken\",\"type\":{\"type\":\"string\",\"avro.java.string\":\"String\"}}]}"}
```

---

### 8. Start einer weiteren **MongoDB** Instanz für das VS Code Backend
```bash
docker run -d --name mongodb -p 27017:27017 mongo
```

Erstelle anschließend in der MongoDB:
- **Datenbank:** `vscode-backend`
- **Collection:** `snapshots`

💡 Tipp: Verwende z. B. **MongoDB Compass**, um dies bequem anzulegen.

---

### 9. Start des **VS Code Backends**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/vs-code-backend.git
cd vs-code-backend
git checkout visualize-debug-state
npm install
npm run start
```

---

### 10. Start des **Code Service**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/code-service.git
cd code-service
./gradlew quarkusDev
```

---

### 11. Start der **VS Code Extension**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/vs-code-extension.git
cd vs-code-extension
git checkout visualize-debug-state
npm install
code .
```

---

### 12. Erstellen der Landscapestruktur
**Entweder:**
```bash
cd ~
git clone https://git.se.informatik.uni-kiel.de/ExplorViz/code/code-service.git
cd code-service
./gradlew quarkusDev
```
Nutze die Anleitung in der README.md des Code-Agents, um für das gewünschte versionierte Java-Programm eine Landscapestruktur zu erstellen.

**Alternativ (aber wesentlich aufwendiger):**
Aktiviere die Funktionalität, den InspectIT Ocelot Agent an die Debug-Session anzuhängen. Führe dafür folgende Schritte in der VS Code Extension aus:
- Entkommentiere den auskommentierten Code in der Funktion `attachInspectITClient()` in `src/extension.ts`. 
- Passe dann `ocelot/inspectit.yml` an, um das gewünschte versionierte Java-Programm zu tracken.
- Debugge das Programm durch "Step Into"- und "Step Out"-Befehle (es sollen viele Funktionsaufrufe geschehen).
- Die Landscapestruktur sollte nun basierend auf den gesammelten Traces erstellt worden sein. 
- Kommentiere den entkommentierten Code wieder aus.


> Nun kannst du die Extension im **Debug Panel → "Run Extension"** starten.  
> Öffne im laufenden Extension-Fenster ein versioniertes Java-Projekt (also clonen und im Workspace öffnen, z. B. *spring-petclinic*, siehe https://github.com/spring-projects/spring-petclinic) und führe es im **Debugger** aus.  

Dadurch kannst du mit der ExplorViz VS Code Extension interagieren.


---

### 📚 Weitere Informationen

Für zusätzliche Details zum Debugging siehe: 
- Guide (https://git.se.informatik.uni-kiel.de/ExplorViz/guide-for-survey)

