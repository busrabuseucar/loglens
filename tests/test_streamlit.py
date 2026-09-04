import unittest

from streamlit.testing.v1 import AppTest

class StreamlitTests(unittest.TestCase):
    def test_demo_loads_and_rule_filter_changes_results(self):
        app = AppTest.from_file("app.py").run(timeout=30)
        self.assertEqual(len(app.exception), 0)
        self.assertEqual([metric.value for metric in app.metric], ["161", "28", "3", "4"])
        app.selectbox[0].select("R3").run()
        self.assertEqual(len(app.exception), 0)
        labels = [item.label for item in app.expander]
        self.assertEqual(len(labels), 1)
        self.assertIn("R3", labels[0])
        app.text_input[0].input("no-such-account").run()
        self.assertEqual(len(app.expander), 0)
        self.assertEqual(len(app.exception), 0)

    def test_experiment_presets_keep_main_analysis_unchanged(self):
        app = AppTest.from_file("app.py").run(timeout=30)
        app.button(key="r3_preset_300").click().run()
        self.assertEqual(app.slider(key="r3_delay").value, 300)
        self.assertTrue(any("R3 uyarısı var" in item.value for item in app.warning))
        app.button(key="r3_preset_301").click().run()
        self.assertEqual(app.slider(key="r3_delay").value, 301)
        self.assertTrue(any("R3 uyarısı yok" in item.value for item in app.info))
        self.assertEqual([metric.value for metric in app.metric], ["161", "28", "3", "4"])
        self.assertEqual(len(app.exception), 0)
        app.button(key="r3_preset_160").click().run()
        self.assertTrue(any("R3 uyarısı var" in item.value for item in app.warning))
        self.assertEqual(len(app.exception), 0)

if __name__ == "__main__":
    unittest.main()
