module.exports = function(grunt)
{
	"use strict";

	var Papa = require("papaparse");

	const buildNumberFile = "nextBuildNumber.txt";
	const cacheBusterVariableName = "build";
	const buildNumber = parseInt(grunt.file.read(buildNumberFile));
	grunt.file.write(buildNumberFile, buildNumber + 1); // Update the next build number


	function stripMinOrFull(dest, src)
	{
		var fullOriginalDest = dest + src,
			testExp = /(.*)(\.min|\.full)(\..+)/,
			testResult = testExp.exec(fullOriginalDest),
			outputFile = (testResult === null) ? fullOriginalDest : (testResult[1] + testResult[3]);

		console.log("copying " + fullOriginalDest + " to " + outputFile);

		return outputFile;
	} // end stripMinOrFull()


	function htmlTagWithBuildNumberURL(originalTag, originalUrl, cacheBusterVariableName, buildNumber)
	{
		/*
		if no server name
			add build number at end before named anchor (if there is one)
		else if concertjs.com server name
			working with section after server name and trailing slash,
			add build number at end before named anchor (if there is one)
		else
			don't add build number
		*/
		
		let concertjsServerUrlRegExp = /^(https?:\/\/(?:www.)?concertjs.com)($|((?:\/[^#\n\r\?]+)*\/)?(?:([^#\n\r\?]+)(\?[^#\n\r\?]*)?(#.*)?)$)/,
			finalUrl, finalTag;
		
		if(originalUrl.indexOf(":") < 0)
		{
			let namedAnchorPosition = originalUrl.indexOf("#"),
				existingArgumentsPosition = originalUrl.indexOf("?"),
				argumentsExist = (existingArgumentsPosition > -1),
				newArgString = (argumentsExist ? "&" : "?") + cacheBusterVariableName + "=" + buildNumber;

			if(namedAnchorPosition < 0)
				finalUrl = originalUrl + newArgString;
			else
				finalUrl = originalUrl.substring(0, namedAnchorPosition) + newArgString + originalUrl.substring(namedAnchorPosition);
			finalTag = originalTag.replace(originalUrl, finalUrl);
		}
		else
		{
			let concertjsServerUrlMatch = originalUrl.match(concertjsServerUrlRegExp);
			if(concertjsServerUrlMatch !== null)
			{
				let serverUrl = concertjsServerUrlMatch[1],
					filePath = (typeof(concertjsServerUrlMatch[3]) === "undefined" ? "" : concertjsServerUrlMatch[3]),
					fileNameOrFinalPathSegment = (typeof(concertjsServerUrlMatch[4]) === "undefined" ? "" : concertjsServerUrlMatch[4]),
					argumentsExist = (typeof(concertjsServerUrlMatch[5]) !== "undefined"),
					existingArgumentString = (argumentsExist ? concertjsServerUrlMatch[5] : ""),
					namedAnchorString = (typeof(concertjsServerUrlMatch[6]) === "undefined" ? "" : concertjsServerUrlMatch[6]);

				finalUrl = serverUrl
					+ filePath
					+ fileNameOrFinalPathSegment
					+ existingArgumentString + (argumentsExist ? "&" : "?") + cacheBusterVariableName + "=" + buildNumber
					+ namedAnchorString;
				finalTag = originalTag.replace(originalUrl, finalUrl);
			}
			else
				finalTag = originalTag;
		}

		return finalTag;
	} // end htmlTagWithBuildNumberURL()


	// Project configuration.
	grunt.initConfig(
		{
			pkg: grunt.file.readJSON("package.json"),


			generateData:
			{
				default:
				{
					files:
					[
						{
							src: ["src/data/caseRecords/us-counties_*.csv", "src/data/population/countyPopulations2019.csv"],
							dest: "assembly/data/caseRecords.json"
						}
					]
				}
			},

			eslint:
			{
				projectStandards:
				{
					options: { configFile: "eslint.projectStandards.json" },
					files:
					[
						{
							expand: true,
							cwd: "src/",
							src: ["**/*.js", "!**/*.template.js", "!DocTemplates/**/*"]
						}
					]
				}
			}, // end eslint task definitions


			clean:
			{
				assembly: ["assembly/**/*"],

				www: ["dist/**/*"],

				removeAssembledOriginalJSandCSS:
				{
					src:
					[
						"assembly/**/*.js",
						"assembly/**/*.css",
						"!**/*.full.js",
						"!**/*.full.css"
					]
				},

				removeFullAndMinFiles:
				{
					src:
					[
						"dist/dev/**/*.full.*",
						"dist/dev/**/*.min.*",
						"dist/prod/**/*.full.*",
						"dist/prod/**/*.min.*"
					]
				}
			}, // end clean task definitions


			copy:
			{
				assembleSrcFiles:
				{
					files: [ { expand: true, cwd: "src/", src: ["**/*", "!data/**/*"], dest: "assembly/" } ]
				},

				copyOriginalToFull:
				{
					files:
					[
						{ expand: true, cwd: "assembly/", src: ["**/*.js"], dest: "assembly/", ext: ".full.js" },
						{ expand: true, cwd: "assembly/", src: ["**/*.css"], dest: "assembly/", ext: ".full.css" },
					]
				},

				deployAssembledFiles:
				{
					files:
					[
						{ expand: true, cwd: "assembly/", src: "**/*", dest: "dist/dev/" },
						{ expand: true, cwd: "assembly/", src: "**/*", dest: "dist/prod/" }
					]
				},

				deployComponents:
				{
					files:
					[
						{ src: "node_modules/concert.js/dist/Concert.mjs", dest: "dist/dev/modules/Concert.js" },
						{ src: "node_modules/papaparse/papaparse.js", dest: "dist/dev/scripts/papaparse.js" },
						{ src: "node_modules/vue/dist/vue.esm.browser.js", dest: "dist/dev/modules/vue.js" },

						{ src: "node_modules/concert.js/dist/Concert.min.mjs", dest: "dist/prod/modules/Concert.js" },
						{ src: "node_modules/papaparse/papaparse.min.js", dest: "dist/prod/scripts/papaparse.js" },
						{ src: "node_modules/vue/dist/vue.esm.browser.min.js", dest: "dist/prod/modules/vue.js" }
					]
				},

				selectEnvironment:
				{
					files:
					[
						{ expand: true, cwd: "dist/dev/", src: "**/*.full.css", dest: "dist/dev/", rename: stripMinOrFull },
						{ expand: true, cwd: "dist/dev/", src: "**/*.full.js", dest: "dist/dev/", rename: stripMinOrFull },

						{ expand: true, cwd: "dist/prod/", src: "**/*.min.css", dest: "dist/prod/", rename: stripMinOrFull },
						{ expand: true, cwd: "dist/prod/", src: "**/*.min.js", dest: "dist/prod/", rename: stripMinOrFull }
					]
				},

				quickDevSrcDeployment:
				{
					files: [ { expand: true, cwd: "src/", src: ["**/*"], dest: "dist/dev/" } ]
				}
			}, // end copy task defitions


			addBuildNumbers:
			{
				allOutputHTML: { expand: true, cwd: "dist", src: "**/*.html" }
			}, // end addBuildNumbers task definitions


			cssmin:
			{
				minifyAssembledCSS: { expand: true, cwd: "assembly/", src: "**/*.full.css", dest: "assembly/", ext: ".min.css" }
			}, // end cssmin task definitions


			terser:
			{
				options:
				{
					warnings: "verbose",
					parse: { ecma: 6 },
					compress:
					{
						sequences: false,
						typeofs: false,
						warnings: true
					},
					mangle: {},
					output: { comments: /^!/ }
				},

				minifyAssembledJS: { expand: true, cwd: "assembly/", src: ["**/*.full.js"], dest: "assembly/", ext: ".min.js" }
			} // end terser task definitions
	});
	
	
	// Load the plugins
	grunt.loadNpmTasks("grunt-contrib-clean");
	grunt.loadNpmTasks("grunt-contrib-copy");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-eslint");
	grunt.loadNpmTasks("grunt-terser");
	

	// Define tasks
	grunt.registerMultiTask(
		"addBuildNumbers",
		"Update <a>, <script>, and <link> tags in all HTML output files to add a build number to the linked files, for cache-busting purposes",
		function()
		{
			const fileTargetExp = /<a\s+[^>]*href\s*=\s*"([^"#]+)[^"]*"[^>]*>|<link\s+[^>]*href\s*=\s*"([^"#]+)[^"]*"[^>]*>|<script\s+[^>]*src\s*=\s*"([^"#]+)[^"]*"[^>]*>/g;

			this.files.forEach(
				function (file)
				{
					let i, j, execResults, target, lastIndex, matchFound;

					for(i = 0; i < file.src.length; i++)
					{
						let curFileName = file.src[i],
							originalFileContents = grunt.file.read(curFileName),
							newFileContents;

						// grunt.log.writeln("Examining file:" + curFileName);

						matchFound = false;
						newFileContents = originalFileContents.replace(
							fileTargetExp,
							(match, p1, p2, p3, offset, fullString) =>
								{
									let target = [p1, p2, p3].find(element => typeof(element) === "string"),
										matchReplacement = htmlTagWithBuildNumberURL(match, target, cacheBusterVariableName, buildNumber);
									matchFound = true;
									// grunt.log.writeln("  found entry at position " + offset + ":" + match);
									// grunt.log.writeln("    target=" + target);
									// grunt.log.writeln("    replacement entry=" + matchReplacement);
									return matchReplacement;
								});

						if(matchFound)
							grunt.file.write(curFileName, newFileContents);
						// else
						// 	grunt.log.writeln("  No build numbers needed in this file.");
					}
				}) // end forEach loop over all files

				grunt.log.writeln("Processed " + this.files.length + " files. Current build number: " + buildNumber);
		}); // end call to grunt.registerMultiTask("addBuildNumbers"...)


	grunt.registerMultiTask(
		"generateData",
		"Build case record file for web site from case record file from NYT",
		function()
		{
			const FIPS_Length = 5;
			const NYC_FIPS_CODES = ["36005", "36061", "36081", "36047", "36085"];
			const MS_PER_DAY = 1000 * 60 * 60 * 24;
			const OverallStartDateUTC = new Date(Date.UTC(2000, 0, 1)); // All dates will be tracked as number of days since this date.

			function daysSinceStart(dateValueUTC)
			{
				return Math.round((dateValueUTC.getTime() - OverallStartDateUTC.getTime()) / MS_PER_DAY);
			} // end daysSinceStart()

			function parseDateAsUTC(dateString)
			{
				let pieces = dateString.split("-"),
					parsedDate = new Date(Date.UTC(pieces[0], parseInt(pieces[1], 10) - 1, pieces[2]));
				if (isNaN(parsedDate.getTime()))
					throw "Error: invalid date string:" + dateString;
				return parsedDate;
			} // end parseDateAsUTC()

			function getCountyByID(counties, countyID)
			{
				let matchingCounties = counties.filter(county => (county.id === countyID));
				if (matchingCounties.length > 0)
					return matchingCounties[0];
				else
					return null;
			} // end getCountyByID()

			function addCountyRecord(counties, countyID, date, cases, deaths)
			{
				let intID = parseInt(countyID, 10),
					currentCounty = getCountyByID(counties, intID);
				if (currentCounty === null)
				{
					currentCounty = { id: intID, population: null, dailyRecords: [] };
					counties.push(currentCounty);
				}
				currentCounty.dailyRecords.push({ date: date, cases: cases, deaths: deaths });
			} // end addCountyRecord()

			function dailyRecordSortFunction(record1, record2)
			{
				let sortValue = ((record1.date < record2.date) ? -1 : ((record2.date > record1.date) ? 1 : 0 ));
				return sortValue;
			} // end dailyRecordSortFunction()
		
			let mostRecentFile = null, destFile = null;
			this.files.forEach(
				function(file)
				{
					// Look through the data files and find the most recent one.
					let caseRecordFiles = file.src.filter(fileName => (fileName.indexOf("/caseRecords/") > 0));
					for (let i = 0; i < caseRecordFiles.length; i++)
					{
						let fileName = caseRecordFiles[i],
							datePortion = fileName.substring(fileName.lastIndexOf("_") + 1, fileName.length - 4),
							datePieces = datePortion.split("."),
							year = parseInt(datePieces[0], 10),
							month = parseInt(datePieces[1], 10),
							day = parseInt(datePieces[2], 10),
							fileDate = new Date(year, month - 1, day);
						if (mostRecentFile === null || mostRecentFile.fileDate < fileDate)
							mostRecentFile = { fileName: fileName, fileDate: fileDate };
					}

					// Read the most recent case records CSV data file and parse its contents.
					grunt.log.writeln("Reading case records file: " + mostRecentFile.fileName);
					let fileContents = grunt.file.read(mostRecentFile.fileName);
					let caseRecords = Papa.parse(
						fileContents,
						{
							header: true,
							transformHeader: header => ((header === "fips") ? "id" : header),
							transform: function(value, header) { return ((header === "date") ? daysSinceStart(parseDateAsUTC(value)) : value); },
							dynamicTyping: header => (header === "cases" || header === "deaths"),
							skipEmptyLines: true
						}).data;
					fileContents = null;
		
					// Go through the flat array of daily records and build a data set consisting of
					// an array of counties, each of which has an ID and an array of daily records for it.
					let counties = [], earliestDate = null, latestDate = null;
					let maxCaseCount = 0, maxDeaths = 0;
					caseRecords.forEach(
						caseRecord =>
						{
							let currentCountyID = caseRecord.id, currentRecordDate = caseRecord.date;
							if (currentCountyID !== "" || (caseRecord.county === "New York City" && caseRecord.state === "New York"))
							{
								if (currentCountyID !== "")
									addCountyRecord(counties, currentCountyID, currentRecordDate, caseRecord.cases, caseRecord.deaths);
								else if (caseRecord.county === "New York City" && caseRecord.state === "New York")
								{
									// NYC is a special case; data is recorded for the whole city, not each county within it.
									// So in our data set, we will store that same NYC data in all five NYC counties.
									NYC_FIPS_CODES.forEach(nycFipsCode => { addCountyRecord(counties, nycFipsCode, currentRecordDate, caseRecord.cases, caseRecord.deaths); });
								}
								if (caseRecord.cases > maxCaseCount)
									maxCaseCount = caseRecord.cases;
								if (caseRecord.deaths > maxDeaths)
									maxDeaths = caseRecord.deaths;
							}

							// Keep track of the earliest and latest dates seen in any of the records, for further use below.
							if (earliestDate === null || currentRecordDate < earliestDate)
								earliestDate = currentRecordDate;
							if (latestDate === null || currentRecordDate > latestDate)
								latestDate = currentRecordDate;
						});
					caseRecords = null;
					
					// Fill in any holes in county daily records, so all counties have records from the earliest to the latest date.
					counties.forEach(
						county =>
						{
							let dailyRecords = county.dailyRecords,
								lastFoundDailyRecord = null;
							dailyRecords.sort(dailyRecordSortFunction); // Sort before processing so that we can track the most recent record found in date order.
							for (let dateIterator = earliestDate; dateIterator <= latestDate; dateIterator++)
							{
								let matchingRecordIndex = dailyRecords.findIndex(record => (record.date === dateIterator));
								if (matchingRecordIndex < 0)
								{
									if (lastFoundDailyRecord === null)
										lastFoundDailyRecord = { date: dateIterator, cases: 0, deaths: 0 };
									dailyRecords.push({ date: dateIterator, cases: lastFoundDailyRecord.cases, deaths: lastFoundDailyRecord.deaths });
								}
								else
									lastFoundDailyRecord = dailyRecords[matchingRecordIndex];
							}
							dailyRecords.sort(dailyRecordSortFunction); // Sort again so the JSON output is in chronological order.
						});
					
					// Read the populations CSV data file and parse its contents.
					let populationFiles = file.src.filter(fileName => (fileName.indexOf("/population/") > 0));
					if (populationFiles.length !== 1)
						throw "Population file not specified or too many files present.";
					let populationFile = populationFiles[0];
					grunt.log.writeln("Reading population file: " + populationFile);
					fileContents = grunt.file.read(populationFile);
					let populationRecords = Papa.parse(
						fileContents,
						{
							header: true,
							transform: function(value, header) { return ((header === "FIPS") ? value.padStart(FIPS_Length, "0") : value); },
							dynamicTyping: header => (header === "Population"),
							skipEmptyLines: true
						}).data;
					fileContents = null;

					// Load population data into county data structure.
					let combinedPopulationNYC = 0, newYorkCounties = [], populationCountiesWithoutCaseData = 0;
					populationRecords.forEach(
						populationRecord =>
						{
							let countyID = parseInt(populationRecord.FIPS, 10);
							if (!isNaN(countyID))
							{
								let matchingCounty = getCountyByID(counties, countyID);
								if (matchingCounty === null)
								{
									populationCountiesWithoutCaseData++;
									grunt.log.writeln(
										"Population record found for FIPS " + populationRecord.FIPS
										+ " (" + populationRecord.State + ", " + populationRecord.County + ")"
										+ " but no such county in case data.");
								}
								else
								{
									if (populationRecord.Population !== null && !isNaN(populationRecord.Population))
										matchingCounty.population = populationRecord.Population;
									else
										matchingCounty.population = 0;
									if (NYC_FIPS_CODES.some(newYorkFIPS => (parseInt(newYorkFIPS, 10) === countyID)))
									{
										combinedPopulationNYC += matchingCounty.population;
										newYorkCounties.push(matchingCounty);
									}
								}
							}
						});
					populationRecords = null;
					grunt.log.writeln("Total " + populationCountiesWithoutCaseData + " counties with population but no case data.");
					grunt.log.writeln("");
					
					// All the NYC counties are tracked together in this data set, so give them all the same
					// population as well, to avoid disparate and incorrect per capita displays.
					newYorkCounties.forEach(newYorkCounty => { newYorkCounty.population = combinedPopulationNYC; });

					// Report any counties in the case data set that had no population data, and set their population to zero.
					let countiesWithNoPopulation = counties.filter(county => (county.population === null));
					grunt.log.writeln("Total counties: " + counties.length + ". Counties with no population data: " + countiesWithNoPopulation.length);
					countiesWithNoPopulation.forEach(
						countyWithNoPopulation =>
						{
							grunt.log.writeln("No population data existed for FIPS " + countyWithNoPopulation.id + ". Setting population to zero.");
							countyWithNoPopulation.population = 0;
						});
					grunt.log.writeln("");

					// Sort counties so they are in ascending order by FIPS Code.
					counties.sort((county1, county2) => ((county1.id < county2.id) ? -1 : ((county2.id < county1.id) ? 1 : 0)));

					// Assemble all the data into a larger structure.
					let allCountyData =
					{
						maxCaseCount: maxCaseCount,
						maxDeaths, maxDeaths,
						firstDate: earliestDate,
						lastDate: latestDate,
						counties: counties
					}
					counties = null;

					// Serialize the county data and write it out to the data file.
					let outputFileContents =
						JSON.stringify(
							allCountyData,
							(key, value) => ((key === "date" || key === "firstDate" || key === "lastDate") ? (new Date(value)).getTime() : value));
					allCountyData = null;
					grunt.log.writeln("Data target file:" + file.dest);
					grunt.file.write(file.dest, outputFileContents);
					outputFileContents = null;
				});

		})
	

	grunt.registerTask("clean_all", ["clean:assembly", "clean:www"]);

	grunt.registerTask("lint_src", ["eslint:projectStandards"]);

	grunt.registerTask(
		"build_all",
		[
			"generateData", // build the latest data file
			"copy:assembleSrcFiles", // copy source files into assembly directory
			"copy:copyOriginalToFull", // copy all .js and .css files in assembly directory to *.full.js and *.full.css
			"clean:removeAssembledOriginalJSandCSS", // remove all original .js and css files from assembly directory
			"terser:minifyAssembledJS", // minify all .full.js files in assembly directory into .min.js
			"cssmin:minifyAssembledCSS", // minify all .full.css files in assembly directory into .min.css
			"copy:deployAssembledFiles", // copy all assembly files into dev and prod directories
			"copy:selectEnvironment",  // copy, in prod directory, *.min.js to *.js and *.min.css to *.css, and in dev directory, *.full.js to *.js and *.full.css to *.css
			"clean:removeFullAndMinFiles", // clean all .min.css, .min.js, .full.css, and .full.js files from dev and prod directories
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);
	
	grunt.registerTask(
		"quickbuild_dev",
		[
			"lint_src", // check source
			"copy:quickDevSrcDeployment", // copy source files into dist/dev directory
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);
	
	grunt.registerTask(
		"superquickbuild_dev",
		[
			"copy:quickDevSrcDeployment", // copy source files into dist/dev directory
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);

		grunt.registerTask("rebuild_all", ["clean_all", "build_all"]);

	grunt.registerTask("default", ["lint_src", "rebuild_all"]);
};
