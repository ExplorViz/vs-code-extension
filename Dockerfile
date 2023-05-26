FROM gitpod/openvscode-server

ENV OPENVSCODE_SERVER_ROOT="/home/.openvscode-server"
ENV OPENVSCODE="${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server"

# Pre-install ExplorViz's VS Code Extension
COPY ./explorviz-vscode-extension-0.0.1.vsix /home/extensions/

SHELL ["/bin/bash", "-c"]
RUN \
  exts=(\
  # From https://open-vsx.org/ registry directly
  gitpod.gitpod-theme \
  # From filesystem, .vsix that we downloaded (using bash wildcard '*')
  /home/extensions/* \
  )\
  && for ext in "${exts[@]}"; do ${OPENVSCODE} --install-extension "${ext}"; done