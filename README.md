# dotenvx GUI

A modern, cross-platform desktop application for managing `.env` files with ease. Built with [Tauri](https://tauri.app/), [React](https://react.dev/), and [TypeScript](https://www.typescriptlang.org/).

## Features

- 🖥️ **Cross-platform** - Works on macOS, Windows, and Linux
- ⚡ **Fast & Lightweight** - Built with Tauri for minimal resource usage
- 🎨 **Modern UI** - Clean, intuitive interface with TailwindCSS
- 🔐 **Secure** - Local-first design, no data sent to external servers
- 📝 **Easy Management** - View, edit, and organize environment variables
- 🔄 **Real-time Updates** - Watch for file changes and sync automatically

## Installation

### From Releases

Download the latest release for your platform:

- **macOS**: `.dmg` file (Intel or Apple Silicon)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` file

### From Source

#### Prerequisites

- [Node.js](https://nodejs.org/) 20.x or later
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Bun](https://bun.sh/) package manager

#### Build Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/dotenvx-gui.git
cd dotenvx-gui

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for your platform
bun run tauri build
```

## Development

### Project Structure

```
dotenvx-gui/
├── src/                 # React frontend source
├── src-tauri/          # Tauri backend (Rust)
├── public/             # Static assets
└── package.json        # Node.js dependencies
```

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build frontend assets
- `bun run tauri build` - Build desktop application
- `bun run clean-target` - Clean build artifacts

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or suggestions, please open an [issue](https://github.com/yourusername/dotenvx-gui/issues) on GitHub.
