class Burnrate < Formula
  include Language::Python::Virtualenv

  desc "Local-only credit card spend analytics"
  homepage "https://github.com/pratik1235/burnrate"
  # ci updates this version on the homebrew repo.
  url "https://github.com/pratik1235/burnrate/archive/v0.3.1.tar.gz"
  sha256 "PLACEHOLDER"
  license "Apache-2.0"

  depends_on "expat"
  depends_on "node" => :build
  depends_on "python@3.13"
  depends_on "qpdf"

  skip_clean "libexec"

  def install
    venv = virtualenv_create(libexec, "python3.13")

    # Ensure Python uses Homebrew's expat, not the outdated system one.
    # DYLD_LIBRARY_PATH (not FALLBACK) is required because /usr/lib/libexpat.1.dylib
    # exists on macOS but is too old (missing _XML_SetAllocTrackerActivationThreshold
    # added in expat 2.6.0). FALLBACK is only checked when the library is not found;
    # LIBRARY_PATH overrides the hardcoded absolute path in the .so.
    ENV.prepend_path "DYLD_LIBRARY_PATH", Formula["expat"].opt_lib

    system "python3.13", "-m", "pip",
           "--python=#{libexec}/bin/python",
           "install", "--no-cache-dir",
           "-r", buildpath/"requirements.txt"

    cd "frontend-neopop" do
      system "npm", "ci"
      system "npm", "run", "build"
    end

    libexec.install Dir["backend"]
    libexec.install "requirements.txt"
    (libexec/"frontend-neopop"/"dist").mkpath
    cp_r Dir["frontend-neopop/dist/."], libexec/"frontend-neopop"/"dist"

    (var/"burnrate").mkpath

    (bin/"burnrate").write <<~EOS
      #!/bin/bash
      export BURNRATE_DATA_DIR="#{var}/burnrate"
      export BURNRATE_STATIC_DIR="#{libexec}/frontend-neopop/dist"
      export BURNRATE_HOMEBREW="true"
      export PYTHONPATH="#{libexec}:$PYTHONPATH"
      export DYLD_LIBRARY_PATH="#{Formula["expat"].opt_lib}:$DYLD_LIBRARY_PATH"
      exec "#{libexec}/bin/python" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 "$@"
    EOS
  end

  def post_install
    (var/"burnrate").mkpath
  end

  service do
    run [bin/"burnrate"]
    keep_alive true
    log_path var/"log/burnrate.log"
    error_log_path var/"log/burnrate-error.log"
  end

  def caveats
    <<~EOS
      Data is stored in:
        #{var}/burnrate

      To start burnrate:
        burnrate

      Then open http://localhost:8000 in your browser.

      To run as a background service:
        brew services start burnrate
    EOS
  end

  test do
    port = free_port
    fork do
      ENV["BURNRATE_DATA_DIR"] = testpath/".burnrate"
      ENV["BURNRATE_STATIC_DIR"] = ""
      ENV["PYTHONPATH"] = libexec.to_s
      exec libexec/"bin/python", "-m", "uvicorn", "backend.main:app",
           "--host", "127.0.0.1", "--port", port.to_s
    end
    sleep 3
    output = shell_output("curl -s http://127.0.0.1:#{port}/api/settings")
    assert_match "setup_complete", output
  end
end
