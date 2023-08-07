from setuptools import find_packages, setup

name = "pr1_server"


setup(
  name="pr1_server",
  version="0.0.0",

  packages=find_packages(),

  entry_points={
    "console_scripts": [
      "pr1=pr1_server:main"
    ]
  },

  install_requires=[
    "appdirs==1.4.4",
    "bcrypt==3.2.2",
    "pyinstaller==5.13.0",
    "websockets==10.2"
  ]
)
