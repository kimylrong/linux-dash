'use strict'

require('angular')

const ngRoute = require('angular-route')
const smoothie = require('smoothie')


angular.module('linuxDash', ['ngRoute'])

/**
 * Routes for different tabs on UI
 */
angular.module('linuxDash').config(['$routeProvider', function($routeProvider) {

    $routeProvider.when('/loading', {
    template: `
      <div class="lead" style="text-align: center;">
        <loader></loader>
        Loading...
      </div>
    `,
      controller: function appLoadController ($scope, $location, $rootScope) {

        let loadUrl = localStorage.getItem('currentTab') || 'system-status'
        let loadLinuxDash = () =>$location.path(loadUrl)
        $rootScope.$on('start-linux-dash', loadLinuxDash)

      },
    }).
    when('/system-status', {
      template: `
        <ram-chart></ram-chart>
        <cpu-avg-load-chart></cpu-avg-load-chart>
        <cpu-utilization-chart></cpu-utilization-chart>
        <ram-intensive-processes></ram-intensive-processes>
        <cpu-intensive-processes></cpu-intensive-processes>
        <docker-processes></docker-processes>
        <swap-usage></swap-usage>
        <disk-space></disk-space>
        <cpu-temp></cpu-temp>
      `,
    }).
    when('/basic-info', {
      template: `
        <machine-info></machine-info>
        <memory-info></memory-info>
        <cpu-info></cpu-info>
        <scheduled-crons></scheduled-crons>
        <cron-history></cron-history>
        <io-stats></io-stats>
      `,
    }).
    when('/network', {
      template: `
        <upload-transfer-rate-chart></upload-transfer-rate-chart>
        <download-transfer-rate-chart></download-transfer-rate-chart>
        <ip-addresses></ip-addresses>
        <network-connections></network-connections>
        <arp-cache-table></arp-cache-table>
        <ping-speeds></ping-speeds>
        <bandwidth></bandwidth>
        <internet-speed></internet-speed>
      `,
    }).
    when('/accounts', {
      template: `
        <server-accounts></server-accounts>
        <logged-in-accounts></logged-in-accounts>
        <recent-logins></recent-logins>
      `,
    }).
    when('/apps', {
      template: `
        <common-applications></common-applications>
        <memcached></memcached>
        <redis></redis>
        <pm2></pm2>
      `,
    }).
    otherwise({
      redirectTo: '/loading'
    })

  }
])


/**
 * Service which gets data from server
 * via HTTP or Websocket (if supported)
 */
angular.module('linuxDash').service('server', ['$http', '$rootScope', '$location', class serverService {

  constructor($http, $rootScope, $location) {

    this.websocket = {
      connection: null,
      onMessageEventHandlers: {}
    }

    this.$http = $http
    this.$rootScope = $rootScope
    this.$location = $location

  }

  /**
   * @description:
   *   Establish a websocket connection with server
   *
   * @return Null
   */
  establishWebsocketConnection() {

    let server = this
    let websocketUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.hostname + ':' + window.location.port

    if (server.websocket.connection === null) {

      server.websocket.connection = new WebSocket(websocketUrl, 'linux-dash')

      server.websocket.connection.onopen = function() {
        server.$rootScope.$broadcast("start-linux-dash", {})
        server.$rootScope.$apply()
        console.info('Websocket connection is open')
      }

      server.websocket.connection.onmessage = function(event) {

        var response = JSON.parse(event.data)
        var moduleName = response.moduleName
        var moduleData = JSON.parse(response.output)

        if (!!server.websocket.onMessageEventHandlers[moduleName]) {
          server.websocket.onMessageEventHandlers[moduleName](moduleData)
        } else {
          console.info("Websocket could not find module", moduleName, "in:", server.websocket.onMessageEventHandlers)
        }

      }

      server.websocket.connection.onclose = function() {
        server.websocket.connection = null
      }
    }

  }

  /**
   * @description:
   *   Check if websockets are supported
   *   If so, call establishWebsocketConnection()
   *
   * @return Null
   */
  checkIfWebsocketsAreSupported() {

    let server = this

    var websocketSupport = {
      browser: null,
      server: null,
    }

    // does browser support websockets?
    if (window.WebSocket) {

      websocketSupport.browser = true

      // does backend support websockets?
      server.$http.get("/websocket").then(function(response) {

        // if websocket_support property exists and is trurthy
        // websocketSupport.server will equal true.
        websocketSupport.server = !!response.data["websocket_support"]

      }).catch(function websocketNotSupportedByServer() {

        websocketSupport.server = false
        server.$rootScope.$broadcast("start-linux-dash", {})

      }).then(function finalDecisionOnWebsocket() {

        if (websocketSupport.browser && websocketSupport.server) {

          server.establishWebsocketConnection()

        } else {
          // rootScope event not propogating from here.
          // instead, we manually route to url
          server.$location.path('/system-status')
        }

      })

    }

  }

  /**
   * Handles requests from modules for data from server
   *
   * @param  {String}   moduleName
   * @param  {Function} callback
   * @return {[ Null || callback(server response) ]}
   */
  get(moduleName, callback) {

    let server = this

    // if we have a websocket connection
    if (server.websocket.connection) {

      // and the connection is ready
      if (server.websocket.connection.readyState === 1) {

        // set the callback as the event handler
        // for server response.
        //
        // Callback instance needs to be overwritten
        // each time for this to work. Not sure why.
        server.websocket.onMessageEventHandlers[moduleName] = callback

        //
        server.websocket.connection.send(moduleName)

      } else {
        console.log("Websocket not ready yet.", moduleName)
      }

    }
    // otherwise
    else {

      var moduleAddress = 'server/?module=' + moduleName

      return this.$http.get(moduleAddress).then(function(response) {
        return callback(response.data)
      })

    }

  }

}])

/**
 * Hook to run websocket support check.
 */
angular.module('linuxDash').run(['server', '$location', '$rootScope', function(server, $location, $rootScope) {

  server.checkIfWebsocketsAreSupported()

  var currentRoute = $location.path()
  var currentTab = (currentRoute === '/loading')? 'system-status': currentRoute
  localStorage.setItem('currentTab', currentTab)

  $location.path('/loading')

}])

/**
 * Sidebar for SPA
 */
angular.module('linuxDash').directive('navBar', ['$location', function($location) {
  return {
    restrict: 'E',
    template: `
      <br/>
      <ul>
          <li ng-class="{active: isActive(navItem) }" ng-repeat="navItem in items">
              <a href="#/{{navItem}}">
                  {{getNavItemName(navItem)}}
              </a>
          </li>
      </ul>
    `,
    link: function(scope) {
      scope.items = [
        'system-status',
        'basic-info',
        'network',
        'accounts',
        'apps'
      ]

      scope.getNavItemName = function(url) {
        return url.replace('-', ' ')
      }

      scope.isActive = function(route) {
        return '/' + route === $location.path()
      }
    }
  }

}])

//////////////////////////////////////////////////////////////
////////////////// UI Element Directives ////////////////// //
//////////////////////////////////////////////////////////////

/**
 * Shows loader
 */
angular.module('linuxDash').directive('loader', function() {
  return {
    restrict: 'E',
    scope: {
      width: '@'
    },
    template: '<div class="spinner">' +
      ' <div class="rect1"></div>' +
      ' <div class="rect2"></div>' +
      ' <div class="rect3"></div>' +
      ' <div class="rect4"></div>' +
      ' <div class="rect5"></div>' +
      '</div>'
  }
})

/**
 * Top Bar for widget
 */
angular.module('linuxDash').directive('topBar', function() {
  return {
    restrict: 'E',
    scope: {
      heading: '=',
      refresh: '&',
      lastUpdated: '=',
      info: '=',
    },
    template: `
      <div class="top-bar">
        <last-update timestamp="lastUpdated"></last-update>
        <span class="qs">
          {{ heading }}
          <span class="popover above" ng-if="info">
            {{ info }}
          </span>
        </span>
        <refresh-btn refresh="refresh()"></refresh-btn>
      </div>
    `,
    link: function(scope, element, attrs) {
      var $refreshBtn = element.find('refresh-btn').eq(0)

      if (typeof attrs.noRefreshBtn !== 'undefined') {
        $refreshBtn.remove()
      }
    }
  }
})

/**
 * Shows refresh button and calls
 * provided expression on-click
 */
angular.module('linuxDash').directive('refreshBtn', function() {
  return {
    restrict: 'E',
    scope: {
      refresh: '&'
    },
    template: `<button ng-click="refresh()">↺</button>`
  }
})

/**
 * Message shown when no data is found from server
 */
angular.module('linuxDash').directive('noData', function() {
  return {
    restrict: 'E',
    template: 'No Data'
  }
})

/**
 * Displays last updated timestamp for widget
 */
angular.module('linuxDash').directive('lastUpdate', function() {
  return {
    restrict: 'E',
    scope: {
      timestamp: '='
    },
    template: `
      <span ng-hide="timestamp">Loading...</span>
      <small alt="Last Update Timestamp">
        <span ng-show="timestamp">{{ timestamp | date:'hh:mm:ss a' }}</span>
      </small>
    `
  }
})


////////////////// Plugin Directives //////////////////

/**
 * Fetches and displays table data
 */
angular.module('linuxDash').directive('tableData', ['server', '$rootScope', function(server, $rootScope) {
  return {
    restrict: 'E',
    scope: {
      heading: '@',
      info: '@',
      moduleName: '@',
      width: '@',
      height: '@'
    },
    template: `
      <plugin
        heading="{{ heading }}"
        last-updated="lastGet"
        on-refresh="getData()"
        info="{{ info }}">

        <loader ng-if="!tableRows"></loader>

        <div ng-show="tableRows">

          <table class="table-data-plugin" width="{{ width }}" height="{{ height }}">
            <thead>
                      <tr class="table-data-filter-container" ng-show="tableRows.length">
                          <th colspan="{{ tableHeaders.length }}" class="filter-container">
                              <input class="filter" ng-model="keyword" placeholder="Search">
                          </th>
                      </tr>
              <tr>
                <th ng-repeat="header in tableHeaders track by $index">
                  <a href="" ng-click="setSortColumn(header)">{{ header }}</a>
                  <span class="column-sort-caret">
                    {{ (header === sortByColumn && !sortReverse) ? '&#9650;': ''; }}
                    {{ (header === sortByColumn && sortReverse) ? '&#9660;': ''; }}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr ng-repeat="row in tableRows | filter:keyword">
                <td ng-repeat="header in tableHeaders track by $index">
                  {{ row[header] }}
                </td>
              </tr>
            </tbody>
          </table>

        </div>

        <no-data ng-show="emptyResult"></no-data>
      </plugin>
    `,
    link: function(scope, element) {

      scope.sortByColumn = null
      scope.sortReverse = null

      // set the column to sort by
      scope.setSortColumn = function(column) {

        // if the column is already being sorted
        // reverse the order
        if (column === scope.sortByColumn) {
          scope.sortReverse = !scope.sortReverse
        } else {
          scope.sortByColumn = column
        }

        scope.sortTableRows()
      }

      scope.sortTableRows = function() {
        scope.tableRows.sort(function(currentRow, nextRow) {

          var sortResult = 0

          if (currentRow[scope.sortByColumn] < nextRow[scope.sortByColumn]) {
            sortResult = -1
          } else if (currentRow[scope.sortByColumn] === nextRow[scope.sortByColumn]) {
            sortResult = 0
          } else {
            sortResult = 1
          }

          if (scope.sortReverse) {
            sortResult = -1 * sortResult
          }

          return sortResult
        })
      }

      scope.getData = function() {
        delete scope.tableRows

        server.get(scope.moduleName, function(serverResponseData) {

          if (serverResponseData.length > 0) {
            scope.tableHeaders = Object.keys(serverResponseData[0])
          }

          scope.tableRows = serverResponseData

          if (scope.sortByColumn) {
            scope.sortTableRows()
          }

          scope.lastGet = new Date().getTime()

          if (serverResponseData.length < 1) {
            scope.emptyResult = true
          }

          if (!scope.$$phase && !$rootScope.$$phase) scope.$digest()
        })
      }

      scope.getData()
    }
  }
}])

/**
 * Fetches and displays table data
 */
angular.module('linuxDash').directive('keyValueList', ['server', '$rootScope', function(server, $rootScope) {
  return {
    restrict: 'E',
    scope: {
      heading: '@',
      info: '@',
      moduleName: '@',
    },
    template: `
      <plugin
        heading="{{ heading }}"
        last-updated="lastGet"
        on-refresh="getData()"
        info="{{ info }}">

        <loader ng-if="!tableRows"></loader>

        <div ng-show="tableRows">
          <table class="key-value-list">
            <tbody>
              <tr ng-repeat="(name, value) in tableRows">
                <td><strong>{{ name }}</strong></td>
                <td>{{ value }}</td>
              </tr>
            </tbody>
          </table>

        </div>

        <no-data ng-show="emptyResult"></no-data>
      </plugin>
    `,
    link: function(scope, element) {

      scope.getData = function() {
        delete scope.tableRows

        server.get(scope.moduleName, function(serverResponseData) {
          scope.tableRows = serverResponseData
          scope.lastGet = new Date().getTime()

          if (Object.keys(serverResponseData).length === 0) {
            scope.emptyResult = true
          }

          if (!scope.$$phase && !$rootScope.$$phase) scope.$digest()
        })
      }

      scope.getData()
    }
  }
}])

/**
 * Fetches and displays data as line chart at a certain refresh rate
 */
angular.module('linuxDash').directive('lineChartPlugin', ['$interval', '$compile', 'server', '$window', function($interval, $compile, server, $window) {
  return {
    restrict: 'E',
    scope: {
      heading: '@',
      moduleName: '@',
      refreshRate: '=',
      maxValue: '=',
      minValue: '=',
      getDisplayValue: '=',
      metrics: '=',
      color: '@'
    },
    template: `
      <div class="plugin">

        <top-bar heading="heading" last-updated="lastGet" no-refresh-btn></top-bar>

        <div class="plugin-body no-padding">

          <canvas ng-show="!initializing && !emptyResult" class="canvas" width="400" height="200"></canvas>

          <table ng-show="!initializing && !emptyResult" border="0" class="metrics-table">
            <tbody>
              <tr ng-repeat="metric in metrics">
                <td><strong>{{ metric.name }}</strong></td>
                <td>{{ metric.data }}</td>
              </tr>
            </tbody>
          </table>

          <no-data ng-show="emptyResult"></no-data>

        </div>
      </plugin>
    `,
    link: function(scope, element) {

      scope.initializing = true

      if (!scope.color) scope.color = '0, 255, 0'

      var series, w, h, canvas

      angular.element($window).bind('resize', function() {
        canvas.width = w
        canvas.height = h
      })

      // smoothieJS - Create new chart
      var chart = new smoothie.SmoothieChart({
        borderVisible: false,
        sharpLines: true,
        grid: {
          fillStyle: '#ffffff',
          strokeStyle: 'rgba(232,230,230,0.93)',
          sharpLines: true,
          millisPerLine: 3000,
          borderVisible: false
        },
        labels: {
          fontSize: 11,
          precision: 0,
          fillStyle: '#0f0e0e'
        },
        maxValue: parseInt(scope.maxValue),
        minValue: parseInt(scope.minValue),
        horizontalLines: [{
          value: 5,
          color: '#eff',
          lineWidth: 1
        }]
      })

      // smoothieJS - set up canvas element for chart
      canvas  = element.find('canvas')[0]
      series  = new smoothie.TimeSeries()
      w       = canvas.width
      h       = canvas.height

      chart.addTimeSeries(series, {
        strokeStyle: 'rgba(' + scope.color + ', 1)',
        fillStyle: 'rgba(' + scope.color + ', 0.2)',
        lineWidth: 2
      })

      chart.streamTo(canvas, 1000)

      var dataCallInProgress = false

      // update data on chart
      scope.getData = function() {

        if(scope.initializing)
          scope.initializing = false

        if (dataCallInProgress) return

        dataCallInProgress = true

        server.get(scope.moduleName, function(serverResponseData) {

          if (serverResponseData.length < 1) {
            scope.emptyResult = true
            return
          }

          dataCallInProgress = false
          scope.lastGet      = new Date().getTime()

          // change graph colour depending on usage
          if (scope.maxValue / 4 * 3 < scope.getDisplayValue(serverResponseData)) {
            chart.seriesSet[0].options.strokeStyle = 'rgba(255, 89, 0, 1)'
            chart.seriesSet[0].options.fillStyle = 'rgba(255, 89, 0, 0.2)'
          } else if (scope.maxValue / 3 < scope.getDisplayValue(serverResponseData)) {
            chart.seriesSet[0].options.strokeStyle = 'rgba(255, 238, 0, 1)'
            chart.seriesSet[0].options.fillStyle = 'rgba(255, 238, 0, 0.2)'
          } else {
            chart.seriesSet[0].options.strokeStyle = 'rgba(' + scope.color + ', 1)'
            chart.seriesSet[0].options.fillStyle = 'rgba(' + scope.color + ', 0.2)'
          }

          // update chart with this response
          series.append(scope.lastGet, scope.getDisplayValue(serverResponseData))

          // update the metrics for this chart
          scope.metrics.forEach(function(metricObj) {
            metricObj.data = metricObj.generate(serverResponseData)
          })

        })
      }

      // set the directive-provided interval
      // at which to run the chart update
      var intervalRef = $interval(scope.getData, scope.refreshRate)
      var removeInterval = function() {
        $interval.cancel(intervalRef)
      }

      element.on("$destroy", removeInterval)
    }
  }
}])

/**
 * Fetches and displays data as line chart at a certain refresh rate
 *
 */
angular.module('linuxDash').directive('multiLineChartPlugin', ['$interval', '$compile', 'server', '$window', function($interval, $compile, server, $window) {
  return {
    restrict: 'E',
    scope: {
      heading: '@',
      moduleName: '@',
      refreshRate: '=',
      getDisplayValue: '=',
      units: '=',
      delay: '='
    },
    template: `
      <div class="plugin">
        <top-bar heading="heading" last-updated="lastGet" no-refresh-btn></top-bar>

        <div class="plugin-body no-padding">

          <canvas class="canvas" width="400" height="200"></canvas>

          <table class="metrics-table" border="0">
            <tbody>
              <tr ng-repeat="metric in metricsArray">
                <td>
                  <div
                    class="metric-square"
                    style="display: inline-block; border: 1px solid {{metric.color}}; width: 8px; height: 8px; background: {{metric.color}}">
                  </div>
                </td>
                <td>{{ metric.name }}</td>
                <td>{{ metric.data }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </plugin>
    `,
    link: function(scope, element) {

      var w, h, canvas

      angular.element($window).bind('resize', function() {
        canvas.width = w
        canvas.height = h
      })

      // smoothieJS - Create new chart
      var chart = new smoothie.SmoothieChart({
        borderVisible: false,
        sharpLines: true,
        grid: {
          fillStyle: '#ffffff',
          strokeStyle: 'rgba(232,230,230,0.93)',
          sharpLines: true,
          borderVisible: false
        },
        labels: {
          fontSize: 12,
          precision: 0,
          fillStyle: '#0f0e0e'
        },
        maxValue: 100,
        minValue: 0,
        horizontalLines: [{
          value: 1,
          color: '#ecc',
          lineWidth: 1
        }]
      })

      var seriesOptions = [{
        strokeStyle: 'rgba(255, 0, 0, 1)',
        lineWidth: 2
      }, {
        strokeStyle: 'rgba(0, 255, 0, 1)',
        lineWidth: 2
      }, {
        strokeStyle: 'rgba(0, 0, 255, 1)',
        lineWidth: 2
      }, {
        strokeStyle: 'rgba(255, 255, 0, 1)',
        lineWidth: 1
      }]

      // smoothieJS - set up canvas element for chart
      var canvas          = element.find('canvas')[0]
      w                   = canvas.width
      h                   = canvas.height
      scope.seriesArray   = []
      scope.metricsArray  = []

      // get the data once to set up # of lines on chart
      server.get(scope.moduleName, function(serverResponseData) {

        var numberOfLines = Object.keys(serverResponseData).length

        for (var x = 0; x < numberOfLines; x++) {

          var keyForThisLine = Object.keys(serverResponseData)[x];

          scope.seriesArray[x] = new smoothie.TimeSeries();
          chart.addTimeSeries(scope.seriesArray[x], seriesOptions[x]);
          scope.metricsArray[x] = {
            name: keyForThisLine,
            color: seriesOptions[x].strokeStyle,
          }
        }

      })

      var delay = 1000

      if (angular.isDefined(scope.delay))
        delay = scope.delay

      chart.streamTo(canvas, delay)

      var dataCallInProgress = false

      // update data on chart
      scope.getData = function() {

        if (dataCallInProgress) return

        if (!scope.seriesArray.length) return

        dataCallInProgress = true

        server.get(scope.moduleName, function(serverResponseData) {

          dataCallInProgress = false
          scope.lastGet = new Date().getTime()
          var keyCount = 0
          var maxAvg = 100

          // update chart with current response
          for (var key in serverResponseData) {
            scope.seriesArray[keyCount].append(scope.lastGet, serverResponseData[key])
            keyCount++
            maxAvg = Math.max(maxAvg, serverResponseData[key])
          }

          // update the metrics for this chart
          scope.metricsArray.forEach(function(metricObj) {
            metricObj.data = serverResponseData[metricObj.name].toString() + ' ' + scope.units
          })

          // round up the average and set the maximum scale
          var len = parseInt(Math.log(maxAvg) / Math.log(10))
          var div = Math.pow(10, len)
          chart.options.maxValue = Math.ceil(maxAvg / div) * div

        })

      }

      var refreshRate = (angular.isDefined(scope.refreshRate)) ? scope.refreshRate : 1000
      var intervalRef = $interval(scope.getData, refreshRate)
      var removeInterval = function() {
        $interval.cancel(intervalRef)
      }

      element.on("$destroy", removeInterval)
    }
  }
}])

/**
 * Base plugin structure
 */
angular.module('linuxDash').directive('plugin', function() {
  return {
    restrict: 'E',
    transclude: true,
    template: `
      <div class="plugin">
        <top-bar
          heading="heading"
          last-updated="lastGet"
          info="info"
          refresh="getData()">
        </top-bar>

        <div class="plugin-body" ng-transclude></div>
      </div>
    `
  }
})

/**
 * Progress bar element
 */
angular.module('linuxDash').directive('progressBarPlugin', function() {
  return {
    restrict: 'E',
    scope: {
      width: '@',
      moduleName: '@',
      name: '@',
      value: '@',
      max: '@'
    },
    template: `
      <div class="progress-bar-container">
        <div class="progress-bar" style="width:{{width}};">
          <div style="width: {{ (value/max) * 100 }}%;"></div>
        </div>
      </div>
    `
  }
})
