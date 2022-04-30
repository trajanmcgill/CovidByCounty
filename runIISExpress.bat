set covidserverlaunchdir="%CD%\dist\%1"
c:
cd "\Program Files\IIS Express"
iisexpress /path:%covidserverlaunchdir%
