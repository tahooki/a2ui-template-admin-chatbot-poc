import argparse
from pathlib import Path
import tempfile
import unittest

import run


class StandaloneRunnerTest(unittest.TestCase):
    def test_reads_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env.local"
            env_path.write_text(
                "# comment\nMAIN_AGENT_URL=http://main-agent:8000\nA2UI_PROXY_PORT='9200'\n",
                encoding="utf-8",
            )
            self.assertEqual(
                run.read_env_file(env_path),
                {
                    "MAIN_AGENT_URL": "http://main-agent:8000",
                    "A2UI_PROXY_PORT": "9200",
                },
            )

    def test_validates_port(self) -> None:
        self.assertEqual(run.port_value("8200"), 8200)
        for invalid in ("0", "65536", "not-a-port"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(argparse.ArgumentTypeError):
                    run.port_value(invalid)

    def test_builds_reload_command(self) -> None:
        command = run.uvicorn_command(
            Path("/tmp/proxy-python"),
            host="127.0.0.1",
            port=9200,
            reload=True,
        )
        self.assertEqual(command[:4], ["/tmp/proxy-python", "-m", "uvicorn", "app.main:app"])
        self.assertIn("127.0.0.1", command)
        self.assertIn("9200", command)
        self.assertIn("--reload", command)


if __name__ == "__main__":
    unittest.main()
