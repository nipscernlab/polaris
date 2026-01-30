#!/bin/bash

# Verifica se as bibliotecas principais já existem (ajustado para gtk-3 e webkit 4.1)
if pkg-config --exists glib-2.0 gtk+-3.0 webkit2gtk-4.1; then
    echo "Bibliotecas encontradas. Iniciando Tauri..."
    exit 0
else
    echo "Bibliotecas faltando. Instalando dependências..."
    
    sudo apt update
    # Note que removi o libwebkit2gtk-4.0-dev da lista abaixo
    sudo apt install -y \
        pkg-config \
        build-essential \
        libglib2.0-dev \
        libgdk-pixbuf2.0-dev \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        librsvg2-dev \
        libssl-dev \
        libayatana-appindicator3-dev
fi