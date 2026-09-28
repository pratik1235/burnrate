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
  depends_on "pkg-config" => :build
  depends_on "python@3.13"
  depends_on "qpdf"

  # cryptography, pydantic (which bundles pydantic-core + jiter) are declared as
  # Homebrew formula dependencies so Homebrew installs them with bottles that were
  # compiled with -headerpad_max_install_names. This avoids MachO::HeaderPadError
  # during the fix_dynamic_linkage step that occurs when the pre-built wheel's
  # @rpath dylib ID lacks enough header padding to be rewritten to the full
  # absolute install path. :no_linkage stops Homebrew from symlinking them into
  # /opt/homebrew/lib, keeping them isolated inside their own keg.
  depends_on "cryptography" => :no_linkage
  depends_on "pydantic" => :no_linkage

  skip_clean "libexec"

  def install
    venv = virtualenv_create(libexec, "python3.13")

    # Ensure Python uses Homebrew's expat, not the outdated system one.
    # DYLD_LIBRARY_PATH (not FALLBACK) is required because /usr/lib/libexpat.1.dylib
    # exists on macOS but is too old (missing _XML_SetAllocTrackerActivationThreshold
    # added in expat 2.6.0). FALLBACK is only checked when the library is not found;
    # LIBRARY_PATH overrides the hardcoded absolute path in the .so.
    ENV.prepend_path "DYLD_LIBRARY_PATH", Formula["expat"].opt_lib

    # Write a filtered requirements file that excludes packages provided by
    # Homebrew formulae (cryptography, pydantic + its pydantic-core/jiter deps).
    # Those Rust-compiled wheels ship @rpath dylib IDs with Mach-O headers too
    # small for Homebrew's relocation to rewrite to the full install path
    # (MachO::HeaderPadError). Their Homebrew bottles are compiled with
    # -headerpad_max_install_names, so they relocate correctly on their own.
    # --no-binary=pikepdf compiles pikepdf against Homebrew's qpdf so the
    # bundled .dylibs in the pre-built wheel don't get invalid page-hash
    # signatures (which caused SIGKILL Code Signature Invalid).
    filtered_reqs = buildpath/"requirements-filtered.txt"
    excluded = %w[cryptography pydantic pydantic-core pydantic_core jiter]
    filtered_reqs.write (buildpath/"requirements.txt").readlines.reject { |l|
      excluded.any? { |pkg| l.strip.downcase.start_with?(pkg) }
    }.join

    system libexec/"bin/python", "-m", "pip",
           "install", "--no-cache-dir",
           "--no-binary=pikepdf",
           "-r", filtered_reqs

    # Inject the Homebrew-managed packages into the venv via .pth files so
    # Python can import them from their Homebrew keg without pip re-installing
    # them. The packages live at opt_prefix/lib/python3.13/site-packages (not
    # inside libexec) because they are regular formula installs, not virtualenvs.
    site_packages = libexec/"lib/python3.13/site-packages"
    %w[cryptography pydantic].each do |pkg|
      homebrew_sp = Formula[pkg].opt_prefix/"lib/python3.13/site-packages"
      (site_packages/"homebrew-#{pkg}.pth").write homebrew_sp.to_s
    end

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
