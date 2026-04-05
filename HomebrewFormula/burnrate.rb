class Burnrate < Formula
  include Language::Python::Virtualenv

  desc "Local-only credit card spend analytics"
  homepage "https://github.com/pratik1235/burnrate"
  url "https://github.com/pratik1235/burnrate/archive/v0.3.0.tar.gz"
  sha256 "PLACEHOLDER"
  license "Apache-2.0"

  depends_on "node" => :build
  depends_on "python@3.13"
  depends_on "qpdf"

  skip_clean "libexec"

  def install
    venv = virtualenv_create(libexec, "python3.13")

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
      export PYTHONPATH="#{libexec}:$PYTHONPATH"
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
