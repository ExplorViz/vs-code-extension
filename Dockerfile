FROM gitpod/openvscode-server

ENV OPENVSCODE_SERVER_ROOT="/home/.openvscode-server"
ENV OPENVSCODE="${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server"

# install JDK 17
USER root
RUN apt-get update -y && apt-get upgrade -y && apt install -y openjdk-17-jdk openjdk-17-jre

USER openvscode-server

# Pre-install ExplorViz's VS Code Extension
COPY ./explorviz-vscode-extension-0.0.1.vsix /home/extensions/

SHELL ["/bin/bash", "-c"]
RUN \
  exts=(\
  # From https://open-vsx.org/ registry directly
  gitpod.gitpod-theme \
  vscjava.vscode-java-pack \
  pivotal.vscode-spring-boot \
  # From filesystem, .vsix that we downloaded (using bash wildcard '*')
  /home/extensions/* \
  )\
  && for ext in "${exts[@]}"; do ${OPENVSCODE} --install-extension "${ext}"; done